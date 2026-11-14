
import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    // 1. Verify the logged-in customer.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please sign in first." },
        { status: 401 }
      );
    }

    // 2. Check server configuration.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    // 3. Retrieve this customer's encrypted Deriv token.
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

    const { data: connection, error: dbError } = await admin
      .from("deriv_connections")
      .select(
        "encrypted_token, token_iv, token_tag, expires_at, status"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) {
      console.error("Deriv database lookup failed:", dbError.code);

      return NextResponse.json(
        { error: "Could not retrieve the saved connection." },
        { status: 500 }
      );
    }

    if (!connection || connection.status !== "connected") {
      return NextResponse.json(
        { error: "Deriv account is not connected." },
        { status: 404 }
      );
    }

    // 4. Check token expiration.
    if (
      connection.expires_at &&
      new Date(connection.expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "Deriv authorization expired. Please reconnect." },
        { status: 401 }
      );
    }

    // 5. Decrypt token on the server only.
    const accessToken = decryptToken(
      connection.encrypted_token,
      connection.token_iv,
      connection.token_tag
    );

    // 6. Request account information from Deriv.
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

    const responseBody = await derivResponse.text();

    let result: any;

    try {
      result = JSON.parse(responseBody);
    } catch {
      result = null;
    }

    // 7. Return safe diagnostic information if Deriv rejects access.
    if (!derivResponse.ok) {
      const derivError = result?.errors?.[0];

      console.error("Deriv account request rejected:", {
        httpStatus: derivResponse.status,
        errorCode: derivError?.code || "Unknown",
        message: derivError?.message || "No error message returned"
      });

      return NextResponse.json(
        {
          success: false,
          derivStatus: derivResponse.status,
          derivCode: derivError?.code || "Unknown",
          error:
            derivError?.message ||
            "Deriv rejected the account request."
        },
        { status: derivResponse.status }
      );
    }

    // 8. Return account information without exposing the token.
    return NextResponse.json(
      {
        success: true,
        accounts: result?.data ?? []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Deriv account API error:", {
      errorType:
        error instanceof Error
          ? error.name
          : "UnknownError"
    });

    return NextResponse.json(
      { error: "Unable to retrieve Deriv account information." },
      { status: 500 }
    );
  }
}
