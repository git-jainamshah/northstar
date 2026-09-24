import {privateHeaders,configured,authenticated,redis,KEY,hostedSnapshot} from '../lib/ibkr-relay.js';
export function createHandler({env=process.env,store=redis,clock=Date.now}={}){
 return async function handler(req,res){
  privateHeaders(res);if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const ready=configured(env),base={enabled:false,connected:false,transport:'hosted',configured:ready,authenticated:false,assets:[],pollIntervalMs:15000};
  if(!ready)return res.json({...base,status:'setup-required',note:'Hosted relay needs private storage and access keys. The local pilot remains available.'});
  if(!authenticated(req,env,clock()))return res.json({...base,status:'locked',note:'Unlock to view your private IBKR feed.'});
  try{const value=await store(['GET',KEY],env);if(!value)return res.json({...base,enabled:true,authenticated:true,status:'waiting-for-worker',note:'No recent relay snapshot. Start the configured relay on your Mac.'});return res.json(hostedSnapshot(JSON.parse(value),clock()));}
  catch{return res.status(503).json({...base,authenticated:true,status:'relay-unavailable',error:'Private relay storage is unavailable. Quotes are hidden until it recovers.'})}
 };
}
export default createHandler();
