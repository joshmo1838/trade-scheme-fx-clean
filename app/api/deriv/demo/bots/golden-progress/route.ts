import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createClient as createAdminClient} from "@supabase/supabase-js";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const noStore={"Cache-Control":"private, no-store, max-age=0"};
const STUDY="senfx-golden-rule-15m-v1";

/**
 * Privately read ONE paper-only 15M research experiment.
 * Requires a logged-in Supabase admin; never starts a collector, reads
 * broker credentials, changes a run or places a trade.
 */
export async function GET(){
 try{
  const userClient=await createClient();
  const {data:{user},error:authError}=await userClient.auth.getUser();
  if(authError||!user)return NextResponse.json({
   ok:false,code:"AUTH_REQUIRED",realMoneySupported:false,
   brokerOrdersPlaced:0
  },{status:401,headers:noStore});
  const {data:profile,error:profileError}=await userClient.from("profiles")
   .select("role").eq("id",user.id).maybeSingle();
  if(profileError||profile?.role!=="admin")return NextResponse.json({
   ok:false,code:"ADMIN_ONLY",brokerOrdersPlaced:0
  },{status:403,headers:noStore});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return NextResponse.json({
   ok:false,code:"RESEARCH_STORAGE_NOT_CONFIGURED"
  },{status:503,headers:noStore});
  const admin=createAdminClient(url,secret,{
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const [progress,lease]=await Promise.all([
   admin.from("senfx_golden_rule_progress")
    .select("bot_id,observations,wins,losses,voids,last_scored_epoch,updated_at")
    .eq("study_key",STUDY).order("bot_id"),
   admin.from("senfx_golden_rule_lease")
    .select("expires_at").eq("study_key",STUDY).maybeSingle()
  ]);
  if(progress.error||lease.error)return NextResponse.json({
   ok:false,code:"RESEARCH_STORAGE_NOT_CONFIGURED",
   collectorRunning:false,brokerOrdersPlaced:0
  },{status:503,headers:noStore});
  const active=!!lease.data?.expires_at&&
   new Date(lease.data.expires_at).getTime()>Date.now();
  const counts=(progress.data||[]).map(row=>({
   botId:row.bot_id,observations:Number(row.observations)||0,
   wins:Number(row.wins)||0,losses:Number(row.losses)||0,
   voids:Number(row.voids)||0,
   lastScoredEpoch:Number(row.last_scored_epoch)||0,
   updatedAt:row.updated_at
  }));
  const total=counts.reduce((n,r)=>n+r.observations,0);
  return NextResponse.json({
   ok:true,study:STUDY,source:"deriv-public-tick-paper-research",
   targetPerBot:1_000_000,targetTotal:15_000_000,
   collectorRunning:active,observationsTotal:total,
   samples:counts,asOf:new Date().toISOString(),
   brokerOrdersPlaced:0,realMoneySupported:false,
   note:"Forward-only paper observations, not Deriv broker-settled contracts or guaranteed future profits."
  },{headers:noStore});
 }catch{
  return NextResponse.json({
   ok:false,code:"GOLDEN_RESEARCH_STATUS_UNAVAILABLE",
   brokerOrdersPlaced:0
  },{status:503,headers:noStore});
 }
}
