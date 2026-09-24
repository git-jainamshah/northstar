import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),path=name=>fileURLToPath(new URL(name,root));
const files=['.env.ibkr.local','.runtime/ibkr-hosted.env','.runtime/ibkr-view-key.txt'];
if(files.some(file=>existsSync(path(file)))){console.error('Relay setup files already exist. Keeping your existing keys; no files were overwritten.');process.exit(1)}
mkdirSync(path('.runtime'),{recursive:true});
const ingest=randomBytes(32).toString('hex'),view=randomBytes(32).toString('hex');
const write=(name,body)=>writeFileSync(path(name),body,{mode:0o600,flag:'wx'});
write(files[0],`NORTHSTAR_IBKR_RELAY_URL=https://northstar-pi-pied.vercel.app/api/ibkr-ingest\nNORTHSTAR_IBKR_INGEST_TOKEN=${ingest}\n`);
write(files[1],`NORTHSTAR_IBKR_INGEST_TOKEN=${ingest}\nNORTHSTAR_IBKR_VIEW_TOKEN=${view}\n`);
write(files[2],view+'\n');
console.log('Created private setup files (keys are not printed):\n'+files.map(path).join('\n')+'\nAdd the two hosted variables and Upstash REST credentials to Vercel Production, then redeploy. See docs/IBKR-RELAY.md.');
