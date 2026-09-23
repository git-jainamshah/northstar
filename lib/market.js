import {ASSETS,CONFIG} from './config.js';
const BASE='https://api.kraken.com/0/public/';
export async function kraken(endpoint,params={},fetcher=fetch){
 const url=new URL(endpoint,BASE);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 const response=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error(`Kraken ${endpoint}: HTTP ${response.status}`);
 const data=await response.json();if(!Array.isArray(data.error)||data.error.length||!data.result)throw new Error(`Kraken ${endpoint}: provider error`);return data.result;
}
export function parseBook(asset,book,meta,now){
 const bid=Number(book?.bids?.[0]?.[0]),ask=Number(book?.asks?.[0]?.[0]);
 const bidAt=Number(book?.bids?.[0]?.[2])*1000,askAt=Number(book?.asks?.[0]?.[2])*1000;
 const observedAt=Math.min(bidAt,askAt),age=now-observedAt;
 if(![bid,ask,bidAt,askAt].every(Number.isFinite)||bid<=0||ask<bid)throw new Error('Invalid or crossed order book');
 if(age>CONFIG.maxQuoteAgeMs||age< -5000)throw new Error('Stale or future-dated order book');
 const bidSize=Number(book.bids[0][1]),askSize=Number(book.asks[0][1]);
 const minQty=Number(meta?.ordermin),minCost=Number(meta?.costmin),precision=Number(meta?.lot_decimals);
 if(![bidSize,askSize,minQty,minCost,precision].every(Number.isFinite)||bidSize<=0||askSize<=0||minQty<=0||minCost<=0||!Number.isInteger(precision)||precision<0||precision>12||meta.status!=='online')throw new Error('Missing or invalid instrument specification');
 return {...asset,bid,ask,bidSize,askSize,mid:(bid+ask)/2,spreadBps:(ask-bid)/((ask+bid)/2)*10000,observedAt,receivedAt:now,source:'Kraken public REST',delay:'Unspecified network latency; polled',quality:'live',minQty,minCost,precision};
}
export function parseBars(rows,now){
 if(!Array.isArray(rows))throw new Error('Missing history');
 // Kraken always includes an unfinished last candle: never train or signal on it.
 const bars=rows.slice(0,-1).map(r=>({time:Number(r[0])*1000,close:Number(r[4]),volume:Number(r[6])}));
 if(bars.length<80||bars.some((b,i)=>!Number.isFinite(b.time)||!Number.isFinite(b.close)||b.close<=0||!Number.isFinite(b.volume)||b.volume<0||(i&&b.time-bars[i-1].time!==3600000)))throw new Error('Insufficient, invalid, or gapped completed history');
 const age=now-(bars.at(-1).time+3600000);if(age<0||age>CONFIG.maxBarAgeMs)throw new Error('Stale or future completed history');return bars;
}
export async function loadMarket({fetcher=fetch,now=Date.now()}={}){
 const output={asOf:now,assets:[],errors:[],source:'Kraken public REST'};
 let specs;try{specs=await kraken('AssetPairs',{pair:ASSETS.map(a=>a.pair).join(',')},fetcher)}catch(e){return {...output,errors:ASSETS.map(a=>({id:a.id,message:e.message}))}}
 for(const asset of ASSETS){try{
 const meta=Object.values(specs).find(s=>s.altname===asset.pair);if(!meta)throw new Error('Instrument metadata unavailable');
 const [depth,ohlc]=await Promise.all([kraken('Depth',{pair:asset.pair,count:1},fetcher),kraken('OHLC',{pair:asset.pair,interval:60},fetcher)]);
 const book=Object.values(depth)[0],rows=Object.entries(ohlc).find(([key])=>key!=='last')?.[1];
 const receivedAt=Date.now();output.assets.push({...parseBook(asset,book,meta,receivedAt),bars:parseBars(rows,receivedAt)});
 }catch(e){output.errors.push({id:asset.id,message:e.message})}}
 output.asOf=Date.now();return output;
}
