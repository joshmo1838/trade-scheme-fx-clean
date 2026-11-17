import { createDecipheriv } from "node:crypto";
import { createClient as createSupabaseAdmin, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const DERIV_API_BASE = "https://api.derivws.com";
export const DEMO_MARKETS = new Set(["R_10", "R_25", "R_50", "R_75", "R_100", "frxEURUSD"]);
export const DEMO_STAKE = 10;
export const DEMO_DAILY_LOSS_LIMIT = 20;

export type DemoAccount = {
  account_id: string;
  account_type: string;
  currency: string;
  balance: string | number;
  status: string;
};

export type DerivDemoContext = {
  user: { id: string; email?: string };
  admin: SupabaseClient;
  account: DemoAccount;
  accessToken: string;
};

export class DemoApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "DEMO_API_ERROR") {
    super(message);
    this.name = "DemoApiError";
    this.status = status;
    this.code = code;
  }
}

function decryptAccessToken(ciphertext: string, iv: string, tag: string): string {
  const keyHex = process.env.DERIV_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new DemoApiError("Deriv token encryption is not configured on the server.", 503, "ENCRYPTION_NOT_CONFIGURED");
  }

  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getDerivDemoContext(): Promise<DerivDemoContext> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new DemoApiError("Please sign in first.", 401, "AUTH_REQUIRED");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new DemoApiError("SENFX server configuration is incomplete.", 503, "SUPABASE_SERVER_CONFIG_MISSING");
  }

  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: connection, error: connectionError } = await admin
    .from("deriv_connections")
    .select("encrypted_token,token_iv,token_tag,expires_at,status,active_account_id,active_account_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError) {
    console.error("Deriv Demo connection lookup failed:", connectionError.code);
    throw new DemoApiError("Could not verify the saved Deriv connection. Apply the Demo execution migration.", 503, "CONNECTION_LOOKUP_FAILED");
  }

  if (!connection || connection.status !== "connected") {
    throw new DemoApiError("Connect your Deriv account before using Demo execution.", 409, "DERIV_NOT_CONNECTED");
  }

  if (!connection.active_account_id || connection.active_account_type !== "demo") {
    throw new DemoApiError("Select a Deriv Demo account first. Real accounts cannot be used by SENFX Demo execution.", 409, "DEMO_ACCOUNT_NOT_SELECTED");
  }

  if (!connection.expires_at || new Date(connection.expires_at).getTime() <= Date.now()) {
    throw new DemoApiError("Deriv authorization expired. Reconnect your account.", 401, "DERIV_TOKEN_EXPIRED");
  }

  const accessToken = decryptAccessToken(
    connection.encrypted_token,
    connection.token_iv,
    connection.token_tag,
  );

  const accountsResponse = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const accountsBody = await accountsResponse.json().catch(() => null);
  if (!accountsResponse.ok) {
    const code = accountsBody?.errors?.[0]?.code || "ACCOUNT_API_ERROR";
    throw new DemoApiError("Deriv could not verify your accounts. Reconnect and try again.", accountsResponse.status, String(code));
  }

  const account = (accountsBody?.data || []).find(
    (item: DemoAccount) => item.account_id === connection.active_account_id,
  ) as DemoAccount | undefined;

  if (!account || account.account_type !== "demo" || account.status !== "active") {
    throw new DemoApiError("The selected account is not an active Deriv Demo account. Select a Demo account again.", 409, "DEMO_ACCOUNT_VERIFICATION_FAILED");
  }

  return { user, admin, account, accessToken };
}

export async function getDemoWebSocketUrl(context: DerivDemoContext): Promise<string> {
  const response = await fetch(
    `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(context.account.account_id)}/otp`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${context.accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.data?.url !== "string") {
    const code = body?.errors?.[0]?.code || "OTP_FAILED";
    throw new DemoApiError("Deriv could not issue a Demo trading session. Reconnect or try again.", response.status || 502, String(code));
  }

  const sessionUrl = new URL(body.data.url);
  if (
    sessionUrl.protocol !== "wss:" ||
    sessionUrl.hostname !== "api.derivws.com" ||
    sessionUrl.pathname !== "/trading/v1/options/ws/demo" ||
    !sessionUrl.searchParams.has("otp")
  ) {
    throw new DemoApiError("Deriv returned an unexpected Demo session URL. No trade was sent.", 502, "UNEXPECTED_DEMO_SESSION_URL");
  }

  return sessionUrl.toString();
}

export async function requestOnDemoWebSocket<T = any>(
  websocketUrl: string,
  request: Record<string, unknown>,
  expectedMessageType: string,
  timeoutMs = 8_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let socket: WebSocket | undefined;
    let finished = false;
    const requestId = Number(request.req_id);

    const finish = (error?: Error, value?: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* Socket may already be closed. */ }
      if (error) reject(error);
      else resolve(value as T);
    };

    const timer = setTimeout(
      () => finish(new DemoApiError("Deriv Demo session timed out. Refresh the session and try again.", 504, "DERIV_WS_TIMEOUT")),
      timeoutMs,
    );

    try {
      socket = new WebSocket(websocketUrl);
    } catch {
      finish(new DemoApiError("Could not open the Deriv Demo WebSocket.", 502, "DERIV_WS_CONNECT_FAILED"));
      return;
    }

    const ws = socket;
    ws.addEventListener("open", () => {
      try { ws.send(JSON.stringify(request)); }
      catch { finish(new DemoApiError("Could not send the Deriv Demo request.", 502, "DERIV_WS_SEND_FAILED")); }
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      let message: any;
      try { message = JSON.parse(String(event.data)); }
      catch { return; }

      // Only accept the response correlated to this exact request.
      if (Number(message.req_id) !== requestId) return;
      if (message.error) {
        finish(new DemoApiError(
          String(message.error.message || "Deriv rejected the Demo request."),
          400,
          String(message.error.code || "DERIV_REQUEST_REJECTED"),
        ));
        return;
      }
      if (message.msg_type === expectedMessageType) finish(undefined, message as T);
    });

    ws.addEventListener("error", () => {
      finish(new DemoApiError("The Deriv Demo WebSocket encountered a connection error.", 502, "DERIV_WS_ERROR"));
    });

    ws.addEventListener("close", () => {
      if (!finished) finish(new DemoApiError("Deriv closed the Demo WebSocket before returning a response.", 502, "DERIV_WS_CLOSED"));
    });
  });
}
export function safeDemoError(error: unknown) {
  if (error instanceof DemoApiError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  console.error("Unexpected SENFX Demo execution error:", error instanceof Error ? error.name : "UnknownError");
  return { error: "SENFX could not complete the Demo request.", code: "INTERNAL_ERROR", status: 500 };
}

export async function getDemoStatement(context: DerivDemoContext, dateFrom: number) {
  const websocketUrl = await getDemoWebSocketUrl(context);
  const reqId = (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1000);
  return requestOnDemoWebSocket<any>(
    websocketUrl,
    {
      statement: 1,
      action_type: "buy",
      date_from: Math.max(0, Math.floor(dateFrom) - 5),
      description: 1,
      limit: 999,
      req_id: reqId,
    },
    "statement",
    12_000,
  );
}

export type DemoSocketSession = {
  request<T = any>(
    expectedMessageType: string,
    payload: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T>;
  close(): void;
};

export async function openDerivDemoSession(
  context: DerivDemoContext,
): Promise<DemoSocketSession> {
  const url = await getDemoWebSocketUrl(context);
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    throw new DemoApiError("Could not open the Deriv Demo WebSocket.", 502, "DERIV_WS_CONNECT_FAILED");
  }

  await new Promise<void>((resolve, reject) => {
    let complete = false;
    const timer = setTimeout(() => {
      if (complete) return;
      complete = true;
      try { socket.close(); } catch { /* Already closed. */ }
      reject(new DemoApiError("Deriv Demo connection timed out.", 504, "DERIV_WS_CONNECT_TIMEOUT"));
    }, 10_000);

    socket.addEventListener("open", () => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      resolve();
    }, { once: true });

    socket.addEventListener("error", () => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* Already closed. */ }
      reject(new DemoApiError("Deriv Demo connection failed.", 502, "DERIV_WS_CONNECT_FAILED"));
    }, { once: true });

    socket.addEventListener("close", () => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      reject(new DemoApiError("Deriv closed the Demo session before it opened.", 502, "DERIV_WS_CLOSED"));
    }, { once: true });
  });

  const pending = new Map<number, {
    expectedType: string;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  let counter = 1;
  let closed = false;

  socket.addEventListener("message", (event: MessageEvent) => {
    let message: any;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    const reqId = Number(message.req_id);
    const waiter = pending.get(reqId);
    if (!waiter) return;

    if (message.error) {
      clearTimeout(waiter.timer);
      pending.delete(reqId);
      waiter.reject(new DemoApiError(
        String(message.error.message || "Deriv rejected the Demo request."),
        400,
        String(message.error.code || "DERIV_REQUEST_REJECTED"),
      ));
      return;
    }

    if (message.msg_type === waiter.expectedType) {
      clearTimeout(waiter.timer);
      pending.delete(reqId);
      waiter.resolve(message);
    }
  });

  const close = () => {
    if (closed) return;
    closed = true;
    pending.forEach(waiter => {
      clearTimeout(waiter.timer);
      waiter.reject(new DemoApiError("Demo session closed.", 502, "DERIV_WS_CLOSED"));
    });
    pending.clear();
    try { socket.close(); } catch { /* Already closed. */ }
  };

  socket.addEventListener("close", () => {
    if (closed) return;
    closed = true;
    pending.forEach(waiter => {
      clearTimeout(waiter.timer);
      waiter.reject(new DemoApiError("Deriv Demo session closed unexpectedly.", 502, "DERIV_WS_CLOSED"));
    });
    pending.clear();
  });

  socket.addEventListener("error", () => {
    if (closed) return;
    // Let individual requests time out or receive their matching error response.
  });

  return {
    request<T = any>(expectedMessageType: string, payload: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
      if (closed || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new DemoApiError("Deriv Demo session is not open.", 502, "DERIV_WS_NOT_OPEN"));
      }
      const reqId = (Date.now() % 1_000_000_000) + counter++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(reqId);
          reject(new DemoApiError("Deriv did not respond before timeout.", 504, "DERIV_WS_TIMEOUT"));
        }, timeoutMs);
        pending.set(reqId, { expectedType: expectedMessageType, resolve, reject, timer });
        try {
          socket.send(JSON.stringify({ ...payload, req_id: reqId }));
        } catch {
          clearTimeout(timer);
          pending.delete(reqId);
          reject(new DemoApiError("Could not send the request to Deriv.", 502, "DERIV_WS_SEND_FAILED"));
        }
      });
    },
    close,
  };
}

