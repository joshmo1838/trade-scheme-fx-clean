
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createDecipheriv } from "node:crypto";

export const dynamic = "force-dynamic";

function decryptToken(
  ciphertext: string,
  iv: string,
  tag: string
): string {
  const keyHex = process.env.DERIV_TOKEN_ENCRYPTION_KEY;

  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("Invalid encryption configuration");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

async function getAuthenticatedAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      admin: null,
      error: NextResponse.json(
        { error: "Please sign in." },
        { status: 401 }
      )
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      user: null,
      admin: null,
      error: NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      )
    };
  }

  const admin = createSupabaseAdmin(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  return { user, admin, error: null };
}

// Retrieve the saved account selection.
export async function GET() {
  try {
    const { user, admin, error } =
      await getAuthenticatedAdmin();

    if (error || !user || !admin) {
      return error!;
    }

    const { data, error: dbError } = await admin
      .from("deriv_connections")
      .select("active_account_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError || !data) {
      return NextResponse.json(
        { error: "Could not retrieve your saved account." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      active_account_id: data.active_account_id || "",
      status: data.status
    });
  } catch (error) {
    console.error("Account selection retrieval failed:", {
      errorType:
        error instanceof Error ? error.name : "UnknownError"
    });

    return NextResponse.json(
      { error: "Unable to retrieve your saved account." },
      { status: 500 }
    );
  }
}

// Verify and save a selected Deriv account.
export async function POST(request: NextRequest) {
  try {
    const { user, admin, error } =
      await getAuthenticatedAdmin();

    if (error || !user || !admin) {
      return error!;
    }

    const body = await request.json();
    const accountId = body?.account_id;

    if (
      typeof accountId !== "string" ||
      !/^[A-Za-z0-9]+$/.test(accountId)
    ) {
      return NextResponse.json(
        { error: "Invalid account ID." },
        { status: 400 }
      );
    }

    const { data: connection, error: dbError } = await admin
      .from("deriv_connections")
      .select(
        "encrypted_token, token_iv, token_tag, expires_at, status"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError || !connection) {
      return NextResponse.json(
        { error: "Deriv connection not found." },
        { status: 404 }
      );
    }

    if (connection.status !== "connected") {
      return NextResponse.json(
        { error: "Deriv is not connected." },
        { status: 403 }
      );
    }

    if (
      connection.expires_at &&
      new Date(connection.expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "Deriv authorization has expired." },
        { status: 401 }
      );
    }

    const accessToken = decryptToken(
      connection.encrypted_token,
      connection.token_iv,
      connection.token_tag
    );

    const derivResponse = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!derivResponse.ok) {
      console.error("Deriv account verification failed:", {
        status: derivResponse.status
      });

      return NextResponse.json(
        { error: "Could not verify the Deriv account." },
        { status: derivResponse.status }
      );
    }

    const result = await derivResponse.json();
    const accounts = result?.data ?? [];

    const accountBelongsToUser = accounts.some(
      (account: { account_id?: string }) =>
        account.account_id === accountId
    );

    if (!accountBelongsToUser) {
      return NextResponse.json(
        {
          error:
            "This account does not belong to your Deriv connection."
        },
        { status: 403 }
      );
    }

    const { error: updateError } = await admin
      .from("deriv_connections")
      .update({
        active_account_id: accountId
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Active account save failed:", updateError.code);

      return NextResponse.json(
        { error: "Could not save your account selection." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      active_account_id: accountId,
      message: "Deriv account selection saved successfully."
    });
  } catch (error) {
    console.error("Account selection API failed:", {
      errorType:
        error instanceof Error ? error.name : "UnknownError"
    });

    return NextResponse.json(
      { error: "Unable to select Deriv account." },
      { status: 500 }
    );
  }
}
