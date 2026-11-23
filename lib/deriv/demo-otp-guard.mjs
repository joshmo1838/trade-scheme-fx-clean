// Pure validation only. Never log, persist, or send OTP-bearing URLs to telemetry.
export function isVerifiedDemoAccount(accounts, accountId) {
  if (!Array.isArray(accounts) || typeof accountId !== "string") return false;
  if (!/^[A-Za-z0-9]{1,64}$/.test(accountId)) return false;
  return accounts.some(account =>
    account && account.account_id === accountId && account.account_type === "demo"
  );
}

export function validateDemoOtpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" &&
      url.hostname === "api.derivws.com" &&
      url.port === "" &&
      url.username === "" && url.password === "" &&
      url.pathname === "/trading/v1/options/ws/demo" &&
      url.searchParams.has("otp") &&
      url.searchParams.get("otp") !== "" &&
      [...url.searchParams.keys()].every(key => key === "otp") &&
      url.searchParams.getAll("otp").length === 1 &&
      url.hash === "";
  } catch {
    return false;
  }
}

export function validateDemoOtpResponse(payload) {
  return Boolean(payload && typeof payload === "object" &&
    payload.data && typeof payload.data === "object" &&
    validateDemoOtpUrl(payload.data.url));
}
