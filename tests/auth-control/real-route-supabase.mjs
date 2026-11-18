// Disposable CI only: inject a real GoTrue-verified customer token into
// actual Supabase client calls, without exposing/replicating Next.js cookies.
// Imported in tests via the isolated route ESM loader.
import { createClient as supabaseClient } from "@supabase/supabase-js";

const api=process.env.SENFX_TEST_REAL_API_URL;
const anon=process.env.SENFX_TEST_AUTH_ANON_KEY;
if (!api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api) || !anon) {
  throw Error("Real paper-control API test adapter requires local Supabase.");
}
export async function createClient() {
  const token=process.env.SENFX_TEST_CUSTOMER_JWT || "";
  const db=supabaseClient(api,anon,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+(token||anon)}},
  });
  return {
    auth:{getUser:()=>token?db.auth.getUser(token):Promise.resolve({
      data:{user:null},error:{message:"No session"}
    })},
    from:(table)=>db.from(table),
  };
}
