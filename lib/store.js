import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {initialState,validateState} from './engine.js';
export async function readState(path,{allowCreate=false}={}){try{return validateState(JSON.parse(await readFile(path,'utf8')))}catch(e){if(e.code==='ENOENT'&&allowCreate)return initialState();throw e}}
export async function writeState(path,state){validateState(state);await mkdir(dirname(path),{recursive:true});const tmp=`${path}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(state),{mode:0o600});await rename(tmp,path)}
export async function withLock(path,fn){await mkdir(dirname(path),{recursive:true});const lock=path+'.lock';let file;try{file=await open(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw new Error('Another worker owns this ledger. Do not run two writers.');throw e}try{await file.writeFile(String(process.pid));return await fn()}finally{await file.close();await unlink(lock)}}
