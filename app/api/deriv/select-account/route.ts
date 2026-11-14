
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

export async function POST(request: NextRequest) {
  try {
    // Verify the signed-in customer.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please sign in." },
        { status: 401 }
      );
    }

    // Validate the requested account ID.
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    // Retrieve only this customer's saved Deriv connection.
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

    // Decrypt the token on the server.
    const accessToken = decryptToken(
      connection.encrypted_token,
      connection.token_iv,
      connection.token_tag
    );

    // Ask Deriv which accounts belong to this authorization.
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

    // Never accept an account ID that Deriv did not return.
    const accountBelongsToUser = accounts.some(
      (account: { account_id?: string }) =>
        account.account_id === accountId
    );

    if (!accountBelongsToUser) {
      return NextResponse.json(
        { error: "This account does not belong to your Deriv connection." },
        { status: 403 }
      );
    }

    // Save the verified selection for this customer.
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
