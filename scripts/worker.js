import {tick} from './tick.js';
const interval=Math.max(60000,Number(process.env.POLL_INTERVAL_MS)||60000);let stop=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true});
console.log(`Northstar paper-only worker: ${interval/1000}s polling. No brokerage order API exists.`);
while(!stop){try{const r=await tick(process.env.NORTHSTAR_STATE_PATH);console.log(JSON.stringify({time:new Date().toISOString(),status:r.heartbeat.status,equity:r.equity,trades:r.trades.length,halted:r.halted}))}catch(e){console.error(JSON.stringify({time:new Date().toISOString(),error:e.message}))}if(!stop)await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);process.removeListener('SIGTERM',done);process.removeListener('SIGINT',done);resolve()};timer=setTimeout(done,interval);process.once('SIGTERM',done);process.once('SIGINT',done)})}
