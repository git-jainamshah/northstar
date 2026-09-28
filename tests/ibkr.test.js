import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIBKR} from '../lib/ibkr.js';
import {ibkrPanel,ibkrMarket,FEED_HINTS} from '../dist/ibkr.js';
import handler from '../api/ibkr.js';
const snapshot=()=>({schemaVersion:1,asOf:1000,connected:true,status:'connected',assets:[{id:'1',symbol:'MES',category:'Futures',region:'US',currency:'USD',mode:'live',bid:100,ask:101,bidReceivedAt:999,askReceivedAt:1000,history:[]}]});
test('stopped IBKR worker cannot leave live quotes on screen',()=>{
  const result=normalizeIBKR(snapshot(),12000);
  assert.equal(result.status,'worker-offline');
  assert.equal(result.assets[0].status,'disconnected');
  assert.equal(result.assets[0].eligibleForSimulation,false);
});
test('IBKR freshness uses both book sides and rejects future timestamps',()=>{
  const s=snapshot();s.assets[0].bidReceivedAt=-200000;
  assert.equal(normalizeIBKR(s,1001).assets[0].status,'stale');
  s.assets[0].bidReceivedAt=1000;s.assets[0].askReceivedAt=2000;
  assert.equal(normalizeIBKR(s,1001).assets[0].eligibleForSimulation,false);
});
test('delayed, frozen, unknown, crossed and errored books cannot qualify',()=>{
  for(const mode of ['delayed','frozen','delayed-frozen','unknown']){
    const s=snapshot();s.assets[0].mode=mode;
    assert.equal(normalizeIBKR(s,1001).assets[0].eligibleForSimulation,false);
  }
  const s=snapshot();s.assets[0].ask=99;
  assert.equal(normalizeIBKR(s,1001).assets[0].status,'unavailable');
  s.assets[0].ask=101;s.assets[0].error='Missing subscription';
  assert.equal(normalizeIBKR(s,1001).assets[0].eligibleForSimulation,false);
});
test('private pilot UI preserves USD and displays delayed explicitly',()=>{
  const s=normalizeIBKR(snapshot(),1001);s.assets[0].mode='delayed';
  const result=ibkrMarket(s,'Futures','US',null);
  assert.equal(result.series[0].currency,'USD');
  assert.match(result.html,/delayed/);
  assert.match(result.html,/USD/);
  assert.equal(ibkrMarket(s,'Futures','Canada',null),null);
});
test('feed panel shows live/delayed counts and a plain-language hint for a known IBKR code',()=>{
  const s=normalizeIBKR(snapshot(),1001);
  s.events=[{time:1000,code:10197,message:'IBKR reported code 10197.'}];
  const html=ibkrPanel(s);
  assert.match(html,/1 live · 0 delayed/);
  assert.match(html,new RegExp(FEED_HINTS[10197].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('feed panel omits a hint when no known IBKR code is present',()=>{
  const s=normalizeIBKR(snapshot(),1001);
  s.events=[{time:1000,code:2104,message:'Market data farm connected.'}];
  assert.doesNotMatch(ibkrPanel(s),/feed-hint/);
});
test('untrusted provider text is escaped in the feed panel',()=>{
  const s=normalizeIBKR(snapshot(),1001);s.assets[0].symbol='<script>alert(1)</script>';
  assert.doesNotMatch(ibkrPanel(s),/<script>/);
});
test('public endpoint never exposes local IBKR market data',()=>{
  let body;handler({method:'GET'},{setHeader(){},json(v){body=v}});
  assert.equal(body.enabled,false);assert.deepEqual(body.assets,[]);
});
