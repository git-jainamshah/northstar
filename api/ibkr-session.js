import {privateHeaders,configured,sameOrigin,equal,jsonBody,cookie,sessionValue} from '../lib/ibkr-relay.js';
export function createHandler({env=process.env,clock=Date.now}={}){
 return async function handler(req,res){
  privateHeaders(res);if(!['POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!sameOrigin(req,env))return res.status(403).json({error:'Same-origin access required'});
  if(req.method==='DELETE'){res.setHeader('Set-Cookie',cookie('',0));return res.json({ok:true})}
  if(!configured(env))return res.status(503).json({error:'Private relay setup is incomplete'});
  let body;try{body=await jsonBody(req,1024)}catch{return res.status(400).json({error:'Invalid request'})}
  if(!equal(body?.token,env.NORTHSTAR_IBKR_VIEW_TOKEN))return res.status(401).json({error:'Access key not accepted'});
  res.setHeader('Set-Cookie',cookie(sessionValue(env,clock())));return res.json({ok:true});
 };
}
export default createHandler();
