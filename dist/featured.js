import {esc} from './charts.js';
export const FEATURED=[
 {title:'Stocks',items:[['RY','Royal Bank · Canada'],['SHOP','Shopify · Canada'],['AAPL','Apple · US'],['MSFT','Microsoft · US']]},
 {title:'ETFs',items:[['XIU','S&P/TSX 60 · Canada'],['SPY','S&P 500 · US'],['QQQ','Nasdaq 100 · US']]},
 {title:'Futures',items:[['MES','Micro S&P 500'],['MNQ','Micro Nasdaq 100'],['CL','WTI crude oil']]},
 {title:'Options',items:[['C','SPY near-money call'],['P','SPY near-money put']]}
];
export function featuredAsset(feed,category,key){return feed?.assets?.find(a=>a.category===category&&(category==='Options'?a.right===key:category==='Futures'?a.symbol?.startsWith(key):a.symbol===key))}
export function featuredHTML(feed){return `<section class="featured-markets" aria-label="Market watchlist">${FEATURED.map(group=>`<article class="panel featured-group"><h2>${group.title}</h2>${group.items.map(([key,name])=>{
 const a=featuredAsset(feed,group.title,key),last=Number.isFinite(a?.last)&&a.last>0?a.last:null,close=Number.isFinite(a?.close)&&a.close>0?a.close:null,value=last??close;
 const price=value===null?'—':new Intl.NumberFormat('en-CA',{style:'currency',currency:a.currency,maximumFractionDigits:2}).format(value);
 const change=last!==null&&close!==null?(last/close-1)*100:null;
 const state=!feed?.connected?'Offline':!a?'Resolving':value===null?'No quote':a.status==='stale'?'Stale':a.mode==='live'?'Live':a.mode==='delayed'?'Delayed':a.mode||'Unknown';
 return `<button class="featured-row" data-featured="${group.title}:${key}" ${a?'':'disabled'}><span><b>${esc(group.title==='Options'?name:key)}</b><small>${esc(group.title==='Options'&&a?a.expiry+' · '+a.strike+' ×'+a.multiplier:name)}</small></span><span><strong>${price}</strong><small class="${change<0?'negative':change>0?'positive':''}">${change===null?'':(change>=0?'+':'')+change.toFixed(2)+'% · '}${esc(state)}${value!==null?' · '+(last!==null?'last reported':'previous close'):''}</small></span></button>`}).join('')}</article>`).join('')}</section><p class="featured-note">Pinned market watchlist · Updates in the background while Gateway runs · Options/futures prices are per unit, before multiplier · Availability varies by subscription and session.</p>`}
