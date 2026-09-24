import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const python=fileURLToPath(new URL('../.runtime/ibkr-venv/bin/python',import.meta.url));
if(!existsSync(python)){console.error('IBKR SDK environment missing. Follow docs/IBKR-PILOT.md.');process.exit(1)}
const children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const [command,args] of [[python,['scripts/ibkr_worker.py']],[process.execPath,['scripts/dev-server.js']]]){
  const child=spawn(command,args,{cwd,stdio:'inherit',env:{...process.env,PORT:process.env.PORT||'4176'}});
  children.push(child);child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',code=>stop(code||0));
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
