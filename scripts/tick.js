import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMarket} from '../lib/market.js';
import {runTick,report} from '../lib/engine.js';
import {readState,writeState,withLock} from '../lib/store.js';
export async function tick(path=resolve('.runtime/state.json')){return withLock(path,async()=>{const previous=await readState(path,{allowCreate:true});const market=await loadMarket();const state=runTick(previous,market);await writeState(path,state);return report(state)})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await tick(process.env.NORTHSTAR_STATE_PATH);console.log(JSON.stringify({mode:r.mode,equity:r.equity,cash:r.cash,heartbeat:r.heartbeat,decisions:r.decisions.slice(0,2),trades:r.trades.length},null,2))}
