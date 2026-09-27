import {privateHeaders,configured,cookie,redis,KEY,hostedSnapshot} from '../lib/ibkr-relay.js';
import {authorize} from '../lib/auth.js';
export function createHandler({env=process.env,store=redis,clock=Date.now,authorizeUser=authorize}={}){
 return async function handler(req,res){
  privateHeaders(res);if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const ready=configured(env),base={enabled:false,connected:false,transport:'hosted',configured:ready,authenticated:false,assets:[],pollIntervalMs:30000};
  if(!ready)return res.json({...base,status:'setup-required'});
  try{
   const user=await authorizeUser(req,env,store);if(!user)return res.json({...base,status:'locked',note:'Sign in to Northstar.'});
   res.setHeader('Set-Cookie',cookie(user.token));
   const value=await store(['GET',KEY],env);if(!value)return res.json({...base,enabled:true,authenticated:true,status:'waiting-for-worker'});return res.json(hostedSnapshot(JSON.parse(value),clock()));
  }catch{return res.status(503).json({...base,status:'relay-unavailable',error:'Private connection unavailable.'})}
 };
}
export default createHandler();
