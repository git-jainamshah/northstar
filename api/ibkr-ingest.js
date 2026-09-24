import {privateHeaders,configured,equal,jsonBody,sanitizeSnapshot,redis,KEY,STORE_SCRIPT} from '../lib/ibkr-relay.js';
export function createHandler({env=process.env,store=redis,clock=Date.now}={}){
 return async function handler(req,res){
  privateHeaders(res);if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!configured(env))return res.status(503).json({error:'Private relay setup is incomplete'});
  const header=req.headers.authorization||'';if(!header.startsWith('Bearer ')||!equal(header.slice(7),env.NORTHSTAR_IBKR_INGEST_TOKEN))return res.status(401).json({error:'Unauthorized'});
  let snapshot;try{snapshot=sanitizeSnapshot(await jsonBody(req),clock())}catch{return res.status(400).json({error:'Invalid, oversized or expired quote snapshot'})}
  try{const written=await store(['EVAL',STORE_SCRIPT,1,KEY,snapshot.asOf,JSON.stringify(snapshot)],env);return res.json({ok:true,accepted:written===1,asOf:snapshot.asOf})}
  catch{return res.status(503).json({error:'Private relay storage is unavailable'})}
 };
}
export default createHandler();
