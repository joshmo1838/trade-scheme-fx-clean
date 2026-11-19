import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/admin/forward-test/page.tsx", "utf8");
test("R100 forward study is authenticated, admin-only and does read-only database queries", () => {
  assert.match(page, /await supabase\.auth\.getUser\(\)/);
  assert.match(page, /profile\?\.role !== "admin"/);
  assert.match(page, /if \(roleError \|\| profile\?\.role !== "admin"\) redirect\("\/dashboard"\)/);
  assert.ok(page.indexOf('profile?.role !== "admin"') < page.indexOf('createAdminClient(url, key'),
    "Administrator verification must precede service-role reads");
  assert.match(page, /\.from\("senfx_forward_trades"\)/);
  assert.match(page, /\.from\("senfx_forward_runs"\)/);
  assert.match(page, /\.select\(/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.rpc\(|buy\s*:\s*1/);
  assert.match(page, /not broker contracts/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|DERIV_TOKEN_ENCRYPTION_KEY/);
});
test("admin navigation points to role-protected forward study", () => {
  const admin = readFileSync("app/admin/page.tsx", "utf8");
  assert.match(admin, /href="\/admin\/forward-test"/);
});
