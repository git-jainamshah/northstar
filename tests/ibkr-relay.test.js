import test from 'node:test';
import assert from 'node:assert/strict';
import {COOKIE,ORIGIN,authenticated,sessionValue,sanitizeSnapshot,hostedSnapshot,configured} from '../lib/ibkr-relay.js';
import {createHandler as readHandler} from '../api/ibkr.js';
import {createHandler as sessionHandler} from '../api/ibkr-session.js';
import {createHandler as ingestHandler} from '../api/ibkr-ingest.js';
import {ibkrPanel} from '../dist/ibkr.js';
const now=1790225000000,env={NORTHSTAR_IBKR_INGEST_TOKEN:'i'.repeat(64),NORTHSTAR_IBKR_VIEW_TOKEN:'v'.repeat(64),UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-only'};
const snapshot=()=>({schemaVersion:1,asOf:now,connected:true,account:'DO-NOT-STORE',assets:[{conId:1,symbol:'MES',category:'Futures',region:'US',currency:'USD',bid:100,ask:101,bidReceivedAt:now,askReceivedAt:now,mode:'delayed',history:[{time:now,value:100.5}],accountId:'DO-NOT-STORE'}]});
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const req=(method,body,headers={})=>({method,body,headers:{'content-type':'application/json',origin:ORIGIN,...headers}});
const cookie=()=>`${COOKIE}=${sessionValue(env,now)}`;
test('unconfigured deployment has visible setup state without quotes',async()=>{
 const res=response();await readHandler({env:{}})(req('GET'),res);assert.equal(res.body.status,'setup-required');assert.deepEqual(res.body.assets,[]);assert.match(ibkrPanel(res.body),/Cannot connect to market/);
});
test('unauthenticated reads do not access storage or leak quotes',async()=>{
 const res=response();await readHandler({env,store:()=>{throw new Error('must not be called')}})(req('GET'),res);assert.equal(res.body.status,'locked');assert.deepEqual(res.body.assets,[]);assert.match(res.headers['Cache-Control'],/no-store/);assert.match(ibkrPanel(res.body),/Workspace key/);
});
test('writer token cannot read or unlock private quotes',async()=>{
 const res=response();await readHandler({env})(req('GET',undefined,{authorization:`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`}),res);assert.equal(res.body.status,'locked');
 const login=response();await sessionHandler({env,clock:()=>now})(req('POST',{token:env.NORTHSTAR_IBKR_INGEST_TOKEN}),login);assert.equal(login.statusCode,401);
});
test('viewer token cannot write snapshots',async()=>{
 const res=response();await ingestHandler({env})(req('POST',snapshot(),{authorization:`Bearer ${env.NORTHSTAR_IBKR_VIEW_TOKEN}`}),res);assert.equal(res.statusCode,401);
});
test('session is secure, expires, and rotation revokes it',async()=>{
 const res=response();await sessionHandler({env,clock:()=>now})(req('POST',{token:env.NORTHSTAR_IBKR_VIEW_TOKEN}),res);
 assert.equal(res.statusCode,200);assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
 assert.equal(authenticated(req('GET',undefined,{cookie:cookie()}),env,now),true);
 assert.equal(authenticated(req('GET',undefined,{cookie:cookie()}),env,now+8*3600000),false);
 assert.equal(authenticated(req('GET',undefined,{cookie:cookie()}),{...env,NORTHSTAR_IBKR_VIEW_TOKEN:'x'.repeat(64)},now),false);
 assert.equal(authenticated(req('GET',undefined,{cookie:cookie()+'a'}),env,now),false);
});
test('cross-origin login and logout are blocked',async()=>{
 for(const method of ['POST','DELETE']){const res=response();await sessionHandler({env})(req(method,{token:env.NORTHSTAR_IBKR_VIEW_TOKEN},{origin:'https://other.example'}),res);assert.equal(res.statusCode,403);assert.equal(res.headers['Set-Cookie'],undefined)}
});
test('logout expires the browser cookie',async()=>{
 const res=response();await sessionHandler({env})(req('DELETE'),res);assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('private read preserves provider delay and can never enable execution',async()=>{
 const res=response();await readHandler({env,clock:()=>now,store:async()=>JSON.stringify(sanitizeSnapshot(snapshot(),now))})(req('GET',undefined,{cookie:cookie()}),res);
 assert.equal(res.body.assets[0].mode,'delayed');assert.equal(res.body.assets[0].eligibleForSimulation,false);assert.equal(res.body.execution,'disabled');assert.equal(res.body.authenticated,true);
});
test('relay offline threshold accounts for upload interval without rejuvenating quotes',()=>{
 const s=sanitizeSnapshot(snapshot(),now);s.assets[0].mode='live';
 assert.equal(hostedSnapshot(s,now+31000).connected,true);assert.equal(hostedSnapshot(s,now+91000).connected,false);
 s.assets[0].bidReceivedAt=now-121000;assert.equal(hostedSnapshot(s,now).assets[0].eligibleForSimulation,false);
});
test('expired storage returns waiting state; storage failure never leaks cached quotes',async()=>{
 for(const [store,status] of [[async()=>null,'waiting-for-worker'],[async()=>{throw new Error('sensitive failure')},'relay-unavailable']]){const res=response();await readHandler({env,clock:()=>now,store})(req('GET',undefined,{cookie:cookie()}),res);assert.equal(res.body.status,status);assert.deepEqual(res.body.assets,[]);assert.doesNotMatch(JSON.stringify(res.body),/sensitive/)}
});
test('ingest strips account fields and arbitrary messages; forces read-only execution',()=>{
 const s=snapshot();s.execution='live';s.events=[{message:'DO-NOT-STORE'}];s.assets[0].error='DO-NOT-STORE';const clean=sanitizeSnapshot(s,now);
 assert.doesNotMatch(JSON.stringify(clean),/DO-NOT-STORE/);assert.equal(clean.execution,'disabled');assert.equal(clean.readOnly,true);
});
test('expired, future, out-of-order histories and oversized uploads are rejected',async()=>{
 for(const offset of [-16000,6000]){const s=snapshot();s.asOf+=offset;assert.throws(()=>sanitizeSnapshot(s,now))}
 const s=snapshot();s.assets[0].history=[{time:now,value:1},{time:now-1,value:1}];assert.throws(()=>sanitizeSnapshot(s,now));
 const res=response();await ingestHandler({env,clock:()=>now})(req('POST',{padding:'x'.repeat(140000)},{authorization:`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`}),res);assert.equal(res.statusCode,400);
});
test('ingest uses one atomic conditional write and reports duplicate snapshots',async()=>{
 for(const result of [0,1]){let command;const res=response();await ingestHandler({env,clock:()=>now,store:async c=>{command=c;return result}})(req('POST',snapshot(),{authorization:`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`}),res);assert.equal(command[0],'EVAL');assert.match(command[1],/prev.asOf >=/);assert.equal(res.body.accepted,result===1)}
});
test('weak or shared writer/view keys leave deployment unconfigured',()=>{
 assert.equal(configured({...env,NORTHSTAR_IBKR_VIEW_TOKEN:'short'}),false);assert.equal(configured({...env,NORTHSTAR_IBKR_VIEW_TOKEN:env.NORTHSTAR_IBKR_INGEST_TOKEN}),false);
});
