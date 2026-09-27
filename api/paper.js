import {authorize} from '../lib/auth.js';
import {report,validateState} from '../lib/engine.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{if(!await authorize(req))return res.status(401).json({error:'Sign in to Northstar.'})}catch{return res.status(503).json({error:'Sign-in service unavailable'})}
 const token=process.env.NORTHSTAR_STATE_TOKEN;if(!token)return res.status(503).json({error:'Hosted ledger access is not configured. Set NORTHSTAR_STATE_TOKEN to a repository-scoped read-only token; public quotes remain available.',code:'LEDGER_NOT_CONFIGURED'});
 try{const response=await fetch('https://api.github.com/repos/git-jainamshah/northstar/contents/.northstar/state.json?ref=northstar-state',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw new Error('Ledger unavailable');const file=await response.json();if(file.encoding!=='base64')throw new Error('Unexpected ledger encoding');const s=validateState(JSON.parse(Buffer.from(file.content,'base64').toString('utf8')));res.status(200).json({...report(s),runtime:'GitHub Actions hourly pilot',expectedIntervalMs:3600000,scheduling:'Best effort; may be delayed or skipped. Not a continuous real-time worker.'})}catch{res.status(503).json({error:'Cannot read the hosted paper ledger. The account has not been reset.',code:'LEDGER_UNAVAILABLE'})}
}
