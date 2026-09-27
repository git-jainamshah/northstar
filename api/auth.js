import {privateHeaders,configured,sameOrigin,equal,jsonBody,cookie,SESSION_SECONDS,redis} from '../lib/ibkr-relay.js';
import {USER_KEY,digest,newToken,validHash,hashPassword,verifyPassword,sessionToken,sessionKey,authorize,RATE_SCRIPT,RESET_SCRIPT} from '../lib/auth.js';
export function createHandler({env=process.env,store=redis}={}){return async(req,res)=>{
 privateHeaders(res);
 if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 try{
  if(req.method==='GET'){const user=await authorize(req,env,store);if(user)res.setHeader('Set-Cookie',cookie(user.token));return res.json({authenticated:!!user,...(user?{email:user.email}:{})})}
  if(req.method==='DELETE'){if(!sameOrigin(req,env))return res.status(403).json({error:'Same-origin request required'});const token=sessionToken(req);if(token)await store(['DEL',sessionKey(token)],env);res.setHeader('Set-Cookie',cookie('',0));return res.json({ok:true})}
  if(!configured(env))return res.status(503).json({error:'Sign-in is not configured yet.'});
  const body=await jsonBody(req,4096);
  if(body.action==='provision'){
   if(!equal(req.headers.authorization,`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`))return res.status(401).json({error:'Unauthorized'});
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email||'')||body.email.length>254||!validHash(body.passwordHash)||!/^\w{64}$/.test(body.recoveryHash||''))return res.status(400).json({error:'Invalid account configuration'});
   const profile={email:body.email.trim().toLowerCase(),passwordHash:body.passwordHash,recoveryHash:body.recoveryHash,version:newToken()};
   const ok=await store(['SET',USER_KEY,JSON.stringify(profile),'NX'],env);return res.status(ok?201:409).json({ok:!!ok});
  }
  if(!sameOrigin(req,env))return res.status(403).json({error:'Same-origin request required'});
  if(!['login','reset'].includes(body.action))return res.status(400).json({error:'Invalid action'});
  // Vercel supplies this trusted client-IP header. Never trust arbitrary forwarded-for values.
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').slice(0,100);
  const count=await store(['EVAL',RATE_SCRIPT,1,'northstar:auth:rate:'+digest(ip),],env);
  if(count>10){res.setHeader('Retry-After','900');return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'})}
  const raw=await store(['GET',USER_KEY],env);if(!raw)return res.status(503).json({error:'Account setup is not complete.'});const profile=JSON.parse(raw);
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(body.action==='login'){
   if(typeof body.password!=='string'||body.password.length>256)return res.status(401).json({error:'Email or password is incorrect.'});
   const matches=await verifyPassword(body.password,profile.passwordHash);
   if(!matches||!equal(email,profile.email))return res.status(401).json({error:'Email or password is incorrect.'});
   const token='v2.'+newToken();await store(['SET',sessionKey(token),profile.version,'EX',SESSION_SECONDS],env);res.setHeader('Set-Cookie',cookie(token));return res.json({authenticated:true,email:profile.email});
  }
  if(typeof body.recoveryCode!=='string'||body.recoveryCode.length>128||!equal(email,profile.email)||!equal(digest(body.recoveryCode.trim()),profile.recoveryHash))return res.status(400).json({error:'Email or recovery code is incorrect.'});
  if(typeof body.password!=='string'||body.password.length<12||body.password.length>256)return res.status(400).json({error:'Use a password between 12 and 256 characters.'});
  const recoveryCode=newToken(),updated={...profile,passwordHash:await hashPassword(body.password),recoveryHash:digest(recoveryCode),version:newToken()};
  const ok=await store(['EVAL',RESET_SCRIPT,1,USER_KEY,profile.version,JSON.stringify(updated)],env);if(!ok)return res.status(409).json({error:'Recovery code was already used. Use the latest code.'});
  res.setHeader('Set-Cookie',cookie('',0));return res.json({ok:true,recoveryCode});
 }catch{return res.status(503).json({error:'Sign-in service is temporarily unavailable. Please retry.'})}
};}
export default createHandler();
