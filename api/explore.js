import {authorize} from '../lib/auth.js';
import {privateHeaders,configured,sameOrigin,jsonBody,redis} from '../lib/ibkr-relay.js';
import {marketRequest,REQUEST_KEY,QUEUE_SCRIPT} from '../lib/explorer.js';
export function createHandler({env=process.env,store=redis,clock=Date.now,authorizeUser=authorize}={}){return async(req,res)=>{
 privateHeaders(res);
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{if(!configured(env)||!await authorizeUser(req,env,store))return res.status(401).json({error:'Sign in to Northstar.'})}catch{return res.status(503).json({error:'Sign-in service unavailable'})}
 if(!sameOrigin(req,env))return res.status(403).json({error:'Same-origin request required'});
 let command;try{command=marketRequest(await jsonBody(req,2048),clock())}catch(e){return res.status(400).json({error:e.message})}
 try{const ok=await store(['EVAL',QUEUE_SCRIPT,1,REQUEST_KEY,command.createdAt,JSON.stringify(command)],env);if(!ok)return res.status(429).json({error:'Please wait two seconds before another request.'});return res.status(202).json({ok:true,id:command.id})}catch{return res.status(503).json({error:'Market request queue unavailable'})}
};}
export default createHandler();
