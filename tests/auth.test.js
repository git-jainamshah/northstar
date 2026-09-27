import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/auth.js';
import {createHandler as feedHandler} from '../api/ibkr.js';
import {createHandler as oldLogin} from '../api/ibkr-session.js';
import paperHandler from '../api/paper.js';
import {USER_KEY,hashPassword,verifyPassword,digest,authorize,AUTH_SCRIPT,RATE_SCRIPT,RESET_SCRIPT,sessionKey} from '../lib/auth.js';
import {COOKIE,ORIGIN} from '../lib/ibkr-relay.js';
const env={NORTHSTAR_IBKR_INGEST_TOKEN:'i'.repeat(64),NORTHSTAR_IBKR_VIEW_TOKEN:'v'.repeat(64),UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test'};
const email='owner@example.test',password='test-password-for-suite',code='r'.repeat(64);
const passwordHash=await hashPassword(password);
function res(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const req=(method,body={},headers={})=>({method,body,headers:{origin:ORIGIN,'content-type':'application/json','x-vercel-forwarded-for':'test-ip',...headers}});
function storage(){const m=new Map();return {m,store:async c=>{
 if(c[0]==='GET')return m.get(c[1])||null;
 if(c[0]==='DEL')return m.delete(c[1])?1:0;
 if(c[0]==='SET'){if(c.includes('NX')&&m.has(c[1]))return null;m.set(c[1],c[2]);return 'OK'}
 if(c[1]===RATE_SCRIPT){const n=(m.get(c[3])||0)+1;m.set(c[3],n);return n}
 if(c[1]===AUTH_SCRIPT){const u=m.get(c[4]);if(!u)return null;const p=JSON.parse(u);return m.get(c[3])===p.version?p.email:null}
 if(c[1]===RESET_SCRIPT){const p=JSON.parse(m.get(c[3]));if(p.version!==c[4])return 0;m.set(c[3],c[5]);return 1}
 throw Error('Unexpected storage command');
 }} }
async function setup(){const s=storage(),h=createHandler({env,store:s.store}),r=res();await h(req('POST',{action:'provision',email,passwordHash,recoveryHash:digest(code)},{authorization:`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`}),r);assert.equal(r.statusCode,201);return {...s,h}}
async function login(h){const r=res();await h(req('POST',{action:'login',email,password}),r);assert.equal(r.statusCode,200);return r.headers['Set-Cookie'].split(';')[0]}
test('password uses salted scrypt; wrong password fails',async()=>{assert.ok(await verifyPassword(password,passwordHash));assert.equal(await verifyPassword('incorrect',passwordHash),false);assert.notEqual(await hashPassword(password),passwordHash)});
test('only writer can provision once; no profile or password returned',async()=>{const {h,m}=await setup(),r=res();await h(req('POST',{action:'provision',email,passwordHash,recoveryHash:digest(code)},{authorization:`Bearer ${env.NORTHSTAR_IBKR_INGEST_TOKEN}`}),r);assert.equal(r.statusCode,409);assert.doesNotMatch(m.get(USER_KEY),/test-password-for-suite/);const a=res();await h(req('POST',{action:'provision'}),a);assert.equal(a.statusCode,401)});
test('sign-in uses opaque secure cookie, sign-out revokes copied session',async()=>{const {h,store}=await setup(),cookie=await login(h);assert.match(cookie,/=v2\.[a-f0-9]{64}$/);assert.ok(await authorize(req('GET',{}, {cookie}),env,store));const out=res();await h(req('DELETE',{}, {cookie}),out);assert.equal(out.statusCode,200);assert.equal(await authorize(req('GET',{}, {cookie}),env,store),null);assert.match(out.headers['Set-Cookie'],/Max-Age=0/)});
test('password reset consumes recovery code, rotates password and revokes every session',async()=>{const {h,store}=await setup(),a=await login(h),b=await login(h),r=res();await h(req('POST',{action:'reset',email,recoveryCode:code,password:'another-test-password'}),r);assert.equal(r.statusCode,200);assert.match(r.body.recoveryCode,/^[a-f0-9]{64}$/);assert.equal(await authorize(req('GET',{}, {cookie:a}),env,store),null);assert.equal(await authorize(req('GET',{}, {cookie:b}),env,store),null);const old=res();await h(req('POST',{action:'reset',email,recoveryCode:code,password}),old);assert.equal(old.statusCode,400);const bad=res();await h(req('POST',{action:'login',email,password}),bad);assert.equal(bad.statusCode,401);const ok=res();await h(req('POST',{action:'login',email,password:'another-test-password'}),ok);assert.equal(ok.statusCode,200)});
test('login errors are generic, attempts throttled, cross-origin changes blocked',async()=>{const {h}=await setup();for(let i=0;i<10;i++){const r=res();await h(req('POST',{action:'login',email:i%2?email:'unknown@example.test',password:'wrong'}),r);assert.equal(r.statusCode,401);assert.equal(r.body.error,'Email or password is incorrect.')}const limit=res();await h(req('POST',{action:'login',email,password}),limit);assert.equal(limit.statusCode,429);const cross=res();await h(req('POST',{action:'login',email,password},{origin:'https://other.test'}),cross);assert.equal(cross.statusCode,403)});
test('legacy keys cannot log in, unauthenticated requests cannot read either ledger',async()=>{const old=res();await oldLogin()(req('POST',{token:env.NORTHSTAR_IBKR_VIEW_TOKEN}),old);assert.equal(old.statusCode,410);const r=res();await feedHandler({env,store:()=>{throw Error('No database reads expected')}})(req('GET'),r);assert.equal(r.body.status,'locked');assert.deepEqual(r.body.assets,[]);const p=res();await paperHandler(req('GET'),p);assert.equal(p.statusCode,401)});
