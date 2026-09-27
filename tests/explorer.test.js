import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRequest,sanitizeExplorer} from '../lib/explorer.js';
import {candleHTML} from '../dist/candles.js';
import {createHandler} from '../api/explore.js';
import {COOKIE,ORIGIN,sessionValue,authenticated} from '../lib/ibkr-relay.js';
const now=Date.now(),env={NORTHSTAR_IBKR_INGEST_TOKEN:'i'.repeat(64),NORTHSTAR_IBKR_VIEW_TOKEN:'v'.repeat(64),UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test'};
const command={id:'test-request-1',action:'search',query:'AAPL'};
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test('discovery accepts only bounded read-only commands and strips arbitrary broker fields',()=>{
 assert.throws(()=>marketRequest({...command,action:'placeOrder'}));
 assert.throws(()=>marketRequest({...command,query:'<script>'}));
 assert.throws(()=>marketRequest({...command,action:'chart',conId:-1}));
 assert.throws(()=>marketRequest({...command,secType:'FUT'}));
 const c=marketRequest({...command,url:'https://evil.test',account:'private',orderId:1},now);assert.equal(c.createdAt,now);assert.equal(c.url,undefined);assert.equal(c.account,undefined);
 assert.equal(marketRequest({...command,secType:'FUT',exchange:'CME'},now).exchange,'CME');
});
test('market queue requires viewer session and same origin, then enforces rate limit',async()=>{
 for(const [headers,expected,storeValue] of [[{},401,1],[{cookie:`${COOKIE}=${sessionValue(env,now)}`,origin:'https://evil.test'},403,1],[{cookie:`${COOKIE}=${sessionValue(env,now)}`,origin:ORIGIN},202,1],[{cookie:`${COOKIE}=${sessionValue(env,now)}`,origin:ORIGIN},429,0]]){
  let calls=0;const res=response();await createHandler({env,clock:()=>now,authorizeUser:async r=>authenticated(r,env,now)?{email:'test'}:null,store:async()=>{calls++;return storeValue}})({method:'POST',headers:{'content-type':'application/json',...headers},body:command},res);assert.equal(res.statusCode,expected);assert.equal(calls,expected===401||expected===403?0:1);
 }
});
test('relay accepts valid OHLC only and strips private metadata',()=>{
 const bar={time:now,open:100,high:103,low:99,close:102,volume:20};
 const x=sanitizeExplorer({account:'secret',instrument:{conId:1,symbol:'AAPL',account:'secret'},bars:[{...bar,high:90},bar,{...bar,time:now-1}],chains:[]});assert.equal(x.bars.length,1);assert.doesNotMatch(JSON.stringify(x),/secret/);
 assert.match(candleHTML(x.bars,{symbol:'<script>'}),/&lt;script&gt;/);assert.doesNotMatch(candleHTML(x.bars),/NaN|Infinity/);assert.match(candleHTML([]),/No price history/);
});
