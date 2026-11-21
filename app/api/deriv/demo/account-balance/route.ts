import {NextResponse} from "next/server";
import {getDerivDemoContext,safeDemoError} from "@/lib/deriv/demo-server";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=20;
const noStore={"Cache-Control":"private, no-store, max-age=0"};

/**
 * Read-only, owner/admin-only Deriv account snapshot. The Demo balance comes
 * directly from Deriv's live accounts API through getDerivDemoContext; it
 * is NEVER inferred from orders, paper signals or a local accumulator.
 * This route does not return the OAuth token or permit any broker purchase.
 */
export async function GET(){
 try{
  const context=await getDerivDemoContext();
  const {data:profile,error}=await context.admin.from("profiles")
   .select("role").eq("id",context.user.id).maybeSingle();
  if(error||profile?.role!=="admin")
   return NextResponse.json({ok:false,code:"ADMIN_DEMO_LOGIN_REQUIRED"},
    {status:403,headers:noStore});
  const account=context.account;
  if(account.account_type!=="demo"||account.currency!=="USD"||
     account.status!=="active")
   return NextResponse.json({ok:false,code:"DERIV_DEMO_USD_ACCOUNT_REQUIRED"},
    {status:409,headers:noStore});
  const balance=Number(account.balance);
  if(!Number.isFinite(balance)||balance<0)
   return NextResponse.json({ok:false,code:"DERIV_BALANCE_UNAVAILABLE"},
    {status:502,headers:noStore});
  const last4=account.account_id.slice(-4);
  return NextResponse.json({
   ok:true,mode:"virtual-deriv-demo-only",accountLabel:"Deriv Demo ••••"+last4,
   currency:"USD",balance,asOf:new Date().toISOString(),source:"deriv-accounts-api",
   realMoneySupported:false
  },{headers:noStore});
 }catch(error){
  const safe=safeDemoError(error);
  return NextResponse.json({ok:false,code:safe.code,error:safe.error},
   {status:safe.status,headers:noStore});
 }
}
