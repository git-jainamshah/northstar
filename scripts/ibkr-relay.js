import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {setTimeout as pause} from 'node:timers/promises';
import {sanitizeSnapshot} from '../lib/ibkr-relay.js';
const root=new URL('../',import.meta.url),path=name=>fileURLToPath(new URL(name,root));
try{loadEnvFile(path('.env.ibkr.local'))}catch(e){if(e.code!=='ENOENT')throw e}
const target=process.env.NORTHSTAR_IBKR_RELAY_URL,token=process.env.NORTHSTAR_IBKR_INGEST_TOKEN;
if(!target||!token||token.length<32){console.error('Relay not configured. Run npm run setup:relay and configure the hosted environment first.');process.exit(1)}
const url=new URL(target);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/ibkr-ingest'){console.error('Relay URL must be an HTTPS /api/ibkr-ingest endpoint without credentials or query parameters.');process.exit(1)}
const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>abort.abort());
let backoff=30000,lastStatus='';
async function status(state){
  if(state!==lastStatus)console.log(`IBKR relay: ${state}`);lastStatus=state;
  const tmp=path('.runtime/ibkr-relay-status.tmp');
  await writeFile(tmp,JSON.stringify({asOf:Date.now(),status:state,destination:url.origin}),{mode:0o600});await rename(tmp,path('.runtime/ibkr-relay-status.json'));
}
while(!abort.signal.aborted){
  try{
    // All input must still be fresh. Never republish an old snapshot with a new timestamp.
    const snapshot=sanitizeSnapshot(JSON.parse(await readFile(path('.runtime/ibkr.json'),'utf8')));
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]),redirect:'error'});
    if(response.ok){await status('connected');backoff=30000;}
    else{await status(response.status===401?'access-key-rejected':response.status===503?'hosted-setup-or-storage-unavailable':`upload-rejected-${response.status}`);backoff=Math.min(backoff*2,300000)}
  }catch{if(!abort.signal.aborted){await status('worker-stale-or-network-unavailable');backoff=Math.min(backoff*2,300000)}}
  try{await pause(backoff,undefined,{signal:abort.signal})}catch{}
}
await status('stopped');
