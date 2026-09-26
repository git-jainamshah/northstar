import test from 'node:test';
import assert from 'node:assert/strict';
import {initialOptions,stepOptions,optionsReport,liquidBook} from '../lib/options-engine.js';
import {sanitizeResearch} from '../lib/options-report.js';
const start=Date.parse('2026-09-25T14:00:00Z');
function feed(now,price=2,mode='live') {return {connected:true,assets:[{conId:1,category:'Options',symbol:'SPY CALL',currency:'USD',right:'C',multiplier:'100',expiry:'20260928',mode,bidSize:10,askSize:10,bidSizeReceivedAt:now,askSizeReceivedAt:now,bid:price,ask:price+0.01,bidReceivedAt:now,askReceivedAt:now},{conId:2,category:'FX',currency:'CAD',mode:'live',bid:1.37,ask:1.371,bidReceivedAt:now,askReceivedAt:now}]};}
function warm(s){for(let i=0;i<=12;i++)stepOptions(s,feed(start+i*10000,2+i*0.02),start+i*10000);return start+120000;}
test('live entry waits for later quote, whole contracts, costs and CAD FX reconcile on five-minute exit',()=>{
 const s=initialOptions(start),now=warm(s);assert.equal(s.pending.side,'BUY');assert.equal(s.trades.length,0);
 stepOptions(s,feed(now,2.24),now+2000);assert.equal(s.trades.length,0);
 stepOptions(s,feed(now+3000,2.24),now+3000);assert.equal(s.position.qty,1);assert.equal(s.position.multiplier,100);assert.ok(s.cash<10000-2.25*100*1.371);
 const cost=s.position.cost,due=s.position.dueAt;stepOptions(s,feed(due,2.25),due);assert.equal(s.pending.side,'SELL');
 stepOptions(s,feed(due+2000,2.25),due+2000);assert.equal(s.position,null);assert.equal(s.trades.length,2);assert.equal(s.trades[1].pnl,s.trades[1].value-cost);assert.ok(Math.abs(s.cash-10000-s.realizedPnl)<1e-8);assert.equal(optionsReport(s).matched,1);
});
test('delayed, frozen, crossed, future, stale and disconnected books never fill',()=>{
 for(const change of [f=>f.assets[0].mode='delayed',f=>f.assets[0].mode='frozen',f=>f.assets[0].bid=9,f=>f.assets[0].bidReceivedAt+=10000,f=>f.assets[0].askReceivedAt-=12000,f=>f.connected=false,f=>f.assets[0].error='missing',f=>f.assets[0].askSize=0,f=>f.assets[0].bidSizeReceivedAt-=20000]){
  const s=initialOptions(start);for(let i=0;i<20;i++){const t=start+i*10000,f=feed(t,2+i*.02);change(f);stepOptions(s,f,t);}assert.equal(s.trades.length,0);assert.equal(s.pending,null);
 }
});
test('flat market does not manufacture activity; fees eliminate edge',()=>{const s=initialOptions(start);for(let i=0;i<40;i++)stepOptions(s,feed(start+i*10000),start+i*10000);assert.equal(s.trades.length,0);assert.ok(s.plans[0].expectedPnl<0)});
test('expiry day, excessive cost, missing FX and outside session block entry',()=>{
 for(const change of [f=>f.assets[0].expiry='20260925',f=>{f.assets[0].bid*=10;f.assets[0].ask*=10},f=>f.assets.pop()]){const s=initialOptions(start);for(let i=0;i<20;i++){const t=start+i*10000,f=feed(t,2+i*.02);change(f);stepOptions(s,f,t);}assert.equal(s.pending,null);assert.equal(s.trades.length,0)}
 const t=Date.parse('2026-09-26T14:00:00Z'),s=initialOptions(t);for(let i=0;i<20;i++)stepOptions(s,feed(t+i*10000,2+i*.02),t+i*10000);assert.equal(s.pending,null);
});
test('stale position is preserved, mark flagged, history gapped; no invented expiry settlement',()=>{
 const s=initialOptions(start),now=warm(s);stepOptions(s,feed(now+2000,2.24),now+2000);const cash=s.cash;stepOptions(s,{connected:false,assets:[]},now+20000);assert.equal(s.cash,cash);assert.equal(s.valuationStale,true);assert.ok(s.position);assert.equal(s.history.at(-1).equity,null);
});
test('restart preserves position and pending intent; cooldown prevents immediate re-entry',()=>{
 let s=initialOptions(start),now=warm(s);s=JSON.parse(JSON.stringify(s));stepOptions(s,feed(now+2000,2.24),now+2000);s=JSON.parse(JSON.stringify(s));stepOptions(s,feed(now+4000,1.9),now+4000);assert.equal(s.pending.side,'SELL');stepOptions(s,feed(now+6000,1.9),now+6000);assert.equal(s.position,null);assert.equal(s.pending,null);assert.ok(s.realizedPnl<0);
});
test('risk pause prevents new entries; worker gap clears model samples',()=>{const s=initialOptions(start);s.halted=true;warm(s);assert.equal(s.pending,null);stepOptions(s,feed(start+180000,2.5),start+180000);assert.equal(s.plans[0].ready,false)});
test('private relay allowlist strips actual account data and invalid numbers',()=>{const s=optionsReport(initialOptions(start));s.accountId='secret';s.position={account:'secret',symbol:'x',cost:NaN};const r=sanitizeResearch(s,start);assert.equal(r.accountId,undefined);assert.equal(r.position.account,undefined);assert.equal(r.position.cost,null);assert.equal(sanitizeResearch({...s,asOf:start+6000},start),null)});
