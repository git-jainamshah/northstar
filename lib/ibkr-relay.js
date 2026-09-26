import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {sanitizeResearch} from './options-report.js';
import {normalizeIBKR} from './ibkr.js';
export const COOKIE='__Host-northstar_ibkr',KEY='northstar:ibkr:latest:v1',MAX_BYTES=128*1024,ORIGIN='https://northstar-pi-pied.vercel.app';
const secret=v=>typeof v==='string'&&v.length>=32;
export const configured=(env=process.env)=>secret(env.NORTHSTAR_IBKR_INGEST_TOKEN)&&secret(env.NORTHSTAR_IBKR_VIEW_TOKEN)&&env.NORTHSTAR_IBKR_INGEST_TOKEN!==env.NORTHSTAR_IBKR_VIEW_TOKEN&&Boolean((env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL)&&(env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN));
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export function privateHeaders(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');}
export function sameOrigin(req,env=process.env){return req.headers.origin===(env.NORTHSTAR_PUBLIC_ORIGIN||ORIGIN);}
export function sessionValue(env=process.env,now=Date.now()){
  const body=`v1.${Math.floor(now/1000)+8*3600}`;
  return `${body}.${createHmac('sha256',env.NORTHSTAR_IBKR_VIEW_TOKEN).update(body).digest('hex')}`;
}
export function authenticated(req,env=process.env,now=Date.now()){
  if(!secret(env.NORTHSTAR_IBKR_VIEW_TOKEN))return false;
  const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const match=/^v1\.(\d{10})\.([a-f0-9]{64})$/.exec(value||'');if(!match)return false;
  const expiry=Number(match[1]),seconds=Math.floor(now/1000);if(expiry<=seconds||expiry>seconds+8*3600)return false;
  return equal(createHmac('sha256',env.NORTHSTAR_IBKR_VIEW_TOKEN).update(`v1.${expiry}`).digest('hex'),match[2]);
}
export function cookie(value,maxAge=8*3600){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export async function jsonBody(req,maxBytes=MAX_BYTES){
  if(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length'])>maxBytes)throw new Error('Invalid payload');
  if(req.body!==undefined){const value=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(value)>maxBytes)throw new Error('Payload too large');return JSON.parse(value)}
  const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>maxBytes)throw new Error('Payload too large');chunks.push(Buffer.from(chunk))}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const str=(v,max=120)=>typeof v==='string'?v.slice(0,max):'';
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
// Allowlist market fields and a separate fictional research account; never brokerage account data.
export function sanitizeSnapshot(s,now=Date.now()){
  if(s?.schemaVersion!==1||!Number.isSafeInteger(s.asOf)||s.asOf>now+5000||now-s.asOf>15000||typeof s.connected!=='boolean'||!Array.isArray(s.assets)||s.assets.length>16)throw new Error('Invalid or expired snapshot');
  const assets=s.assets.map(a=>{
    if(!a||!['Stocks','ETFs','Options','Futures','FX'].includes(a.category)||!['Canada','US'].includes(a.region)||!['CAD','USD'].includes(a.currency)||!Number.isSafeInteger(a.conId)||a.conId<=0)throw new Error('Invalid instrument');
    const result={id:String(a.conId),conId:a.conId,symbol:str(a.symbol,60),category:a.category,region:a.region,currency:a.currency,exchange:str(a.exchange,30),secType:str(a.secType,10),expiry:str(a.expiry,12),strike:num(a.strike),right:str(a.right,2),multiplier:str(a.multiplier,12),mode:['live','delayed','frozen','delayed-frozen'].includes(a.mode)?a.mode:'unknown',error:a.error?'IBKR reported a feed issue. Check the local gateway.':null};
    for(const field of ['bid','ask','last','close','bidSize','askSize']){result[field]=num(a[field]);result[field+'ReceivedAt']=num(a[field+'ReceivedAt']);}
    const history=Array.isArray(a.history)?a.history.slice(-120):[];let previous=0;
    result.history=history.map(p=>{if(!p||!Number.isSafeInteger(p.time)||p.time<previous||p.time>s.asOf+5000||!(p.value===null||Number.isFinite(p.value)))throw new Error('Invalid chart history');previous=p.time;return {time:p.time,value:num(p.value)}});
    return result;
  });
  return {schemaVersion:1,provider:'IBKR TWS API',asOf:s.asOf,connected:s.connected,status:s.connected?'connected':'disconnected',readOnly:true,execution:'disabled',assets,research:sanitizeResearch(s.research,now),events:[],discovery:{},receivedAt:now};
}
export function hostedSnapshot(snapshot,now=Date.now()){
  return {...normalizeIBKR(snapshot,now,90000),transport:'hosted',authenticated:true,configured:true,pollIntervalMs:15000,relayReceivedAt:snapshot.receivedAt,note:'Private relay · snapshots sent every 30 seconds · IBKR data delay is separate.'};
}
export async function redis(command,env=process.env){
  const url=new URL(env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname.endsWith('.upstash.io'))throw new Error('Invalid Redis endpoint');
  const response=await fetch(url.origin,{method:'POST',headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw new Error('Relay storage unavailable');const data=await response.json();if(data.error)throw new Error('Relay storage unavailable');return data.result;
}
// Atomic timestamp comparison prevents retries from overwriting a newer snapshot.
export const STORE_SCRIPT=`local old=redis.call('GET',KEYS[1]); if old then local prev=cjson.decode(old); if prev.asOf >= tonumber(ARGV[1]) then return 0 end end; redis.call('SET',KEYS[1],ARGV[2],'EX',300); return 1`;
