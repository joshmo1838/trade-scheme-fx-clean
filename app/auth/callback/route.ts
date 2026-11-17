import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Authentication callback exchange failed:", error.message);
      return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl));
    }

    return NextResponse.redirect(new URL("/dashboard", requestUrl));
  } catch (error) {
    console.error("Authentication callback failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl));
  }
}
