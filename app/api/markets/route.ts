import { NextResponse } from "next/server";
const symbols=["EUR/USD","GBP/USD","USD/JPY","AUD/USD","XAU/USD","XAG/USD"];
export const dynamic="force-dynamic";
export async function GET(){
 const key=process.env.TWELVEDATA_API_KEY;
 if(!key)return NextResponse.json({live:false,message:"Market data provider is not configured.",quotes:symbols.map(symbol=>({symbol,price:null,change:null,source:"Awaiting API key"}))});
 const quotes=await Promise.all(symbols.map(async symbol=>{try{
  const url=new URL("https://api.twelvedata.com/quote");url.searchParams.set("symbol",symbol);url.searchParams.set("apikey",key);
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(9000)});const data=await response.json();
  if(!response.ok||data.status==="error"||!data.close)return {symbol,price:null,change:null,source:"Provider unavailable"};
  const p=Number(data.close),c=Number(data.percent_change);
  return {symbol,price:Number.isFinite(p)?p:null,change:Number.isFinite(c)?c:null,source:"Twelve Data"};
 }catch{return {symbol,price:null,change:null,source:"Feed unavailable"};}}));
 return NextResponse.json({live:quotes.some(q=>q.price!==null),quotes,updatedAt:new Date().toISOString()});
}
