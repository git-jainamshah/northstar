import {esc,stamp,chartHTML} from './charts.js';
const price=(v,c)=>Number.isFinite(v)?new Intl.NumberFormat('en-CA',{style:'currency',currency:c||'USD',maximumFractionDigits:4}).format(v):'—';
const badge=(text)=>`<span class="badge">${esc(text)}</span>`;
export const FEED_HINTS={
 10197:'Another session (Client Portal, IBKR Mobile, or another TWS/Gateway login) is using this account. Close it, then reconnect.',
 354:'A live data subscription for this instrument was not detected yet.',
 10167:'Live data subscription missing for this instrument; showing delayed data instead.',
 10168:'No data entitlement for this instrument; delayed data is not available either.',
 10089:'This market data requires an additional IBKR subscription.',
 10090:'Part of this market data requires an additional IBKR subscription.',
 10091:'Part of this market data requires an additional IBKR subscription; some ticks may still arrive.',
 326:'Another Northstar connector is already using this API client ID.',
 502:'Cannot reach the IBKR gateway API. Check that Gateway is running and API access is enabled.',
 504:'The IBKR gateway API is not connected. Check the gateway login.',
};
export function ibkrPanel(feed){
 const connected=feed?.connected,assets=feed?.assets||[];
 const live=assets.filter(a=>a.mode==='live').length,delayed=assets.filter(a=>a.mode==='delayed'||a.mode==='delayed-frozen').length;
 const hintCode=feed?.events?.slice().reverse().find(e=>FEED_HINTS[e.code])?.code;
 return `<div class="connection-strip"><span><i class="connection-dot ${connected?'on':''}"></i>IB Gateway <b>${connected?'Connected to API':'Cannot connect to API'}</b>${connected&&(live||delayed)?`<span class="feed-counts">${live} live · ${delayed} delayed</span>`:''}${connected&&delayed?'<span class="feed-delay">Delayed quotes</span>':''}</span>${hintCode?`<span class="feed-hint">${esc(FEED_HINTS[hintCode])}</span>`:''}</div>`;
}
export function ibkrMarket(feed,category,region,selected){
  if(!feed?.enabled)return null;
  const assets=feed.assets.filter(a=>a.category===category&&a.region===region);
  if(!assets.length)return null;
  const a=assets.find(a=>a.id===selected)||assets[0];
  const series=[{name:a.symbol,color:'#65ebc5',currency:a.currency,points:a.history||[]}];
  return {series,html:`<div class="market-layout"><aside class="panel instruments"><div class="panel-head"><h2>Watchlist</h2></div>${assets.map(q=>`<button class="instrument ${q.id===a.id?'active':''}" data-ibkr-asset="${esc(q.id)}" aria-pressed="${q.id===a.id}"><span><b>${esc(q.symbol)}</b><small>${esc(q.currency)} · ${esc(q.mode)}</small></span><span class="instrument-price">${price(q.bid,q.currency)}</span></button>`).join('')}</aside><section class="panel market-chart"><div class="panel-head"><div><span class="eyebrow">IBKR · ${esc(category)} · ${esc(region)}</span><h2>${esc(a.symbol)}</h2></div>${badge(a.mode+' · '+a.status)}</div><div class="chart-toolbar"><span class="dim">${esc(a.currency)} · Bid / ask midpoint · This session</span></div>${chartHTML(series,{label:`${a.symbol} recorded ${a.mode} bid / ask midpoint in ${a.currency}`})}<div class="quote-grid"><article class="stat"><span class="label">Bid</span><strong>${price(a.bid,a.currency)}</strong><small>Received ${stamp(a.bidReceivedAt)}</small></article><article class="stat"><span class="label">Ask</span><strong>${price(a.ask,a.currency)}</strong><small>Received ${stamp(a.askReceivedAt)}</small></article><article class="stat"><span class="label">Last reported trade</span><strong>${price(a.last,a.currency)}</strong><small>May be an earlier session trade · ${esc(a.mode)}</small></article></div><details id="contract-details" class="disclosure"><summary>Contract details</summary><p>Contract ${esc(a.conId)} · ${esc(a.exchange)}${a.expiry?' · Expiry '+esc(a.expiry):''}${a.multiplier?' · Multiplier '+esc(a.multiplier):''}${a.right?' · '+esc(a.right)+' · Strike '+esc(a.strike):''}</p>${a.error?`<p>${esc(a.error)}</p>`:''}<p>Chart begins when the connector starts. Gaps mean no valid two-sided quote. Prices are in ${esc(a.currency)}; contract prices are not the total cost or margin requirement.</p></details><div class="panel-foot">${a.status==='live'?'Live quotes':esc(a.status)} · Received ${stamp(a.receivedAt)} · Prices per unit, before contract multiplier</div></section></div>`};
}
