import {readFile,writeFile,rename,open,unlink,mkdir} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
import {initialOptions,stepOptions,optionsReport} from '../lib/options-engine.js';
import {localIBKR} from '../lib/ibkr.js';
const dir=new URL('../.runtime/',import.meta.url),path=n=>new URL(n,dir);
await mkdir(dir,{recursive:true});
const lock=path('options-worker.lock');
try{const old=Number(await readFile(lock,'utf8'));try{process.kill(old,0);throw new Error('Options worker already running')}catch(e){if(e.code!=='ESRCH')throw e}await unlink(lock)}catch(e){if(e.code!=='ENOENT')throw e}
const handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));await handle.close();
let state;try{state=JSON.parse(await readFile(path('options-state.json'),'utf8'));if(state.version!==1||!Number.isFinite(state.cash))throw new Error('Invalid options ledger')}catch(e){if(e.code!=='ENOENT')throw e;state=initialOptions()}
let stopped=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopped=true});
async function save(name,value){await writeFile(path(name+'.tmp'),JSON.stringify(value),{mode:0o600});await rename(path(name+'.tmp'),path(name));}
try{
 console.log('Options research worker: CAD $10,000 simulated capital; live orders disabled.');
 while(!stopped){stepOptions(state,await localIBKR(path('ibkr.json')));await save('options-state.json',state);await save('options-report.json',optionsReport(state));await pause(1000);}
}finally{await unlink(lock)}
