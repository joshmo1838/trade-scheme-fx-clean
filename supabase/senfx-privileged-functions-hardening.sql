-- Restrict privileged helper access discovered by Supabase security advisors.
-- Applied to the connected SENFX production Supabase project on 2026-11-17
-- and verified with has_function_privilege. Kept in source for auditability.
-- handle_new_user() remains callable by its auth.users trigger owner.
-- is_admin() is needed by signed-in customer/admin RLS policies, so retain
-- authenticated EXECUTE while removing unnecessary anonymous access.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
COMMIT;
