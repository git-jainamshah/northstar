// Read-only market discovery commands. No arbitrary paths, URLs, broker methods or orders.
export const REQUEST_KEY='northstar:explorer:request:v1';
const txt=(v,n=100)=>typeof v==='string'?v.slice(0,n):'';
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const venues=['SMART','TSE','VENTURE','CME','CBOT','NYMEX','COMEX','CDE'];
export function marketRequest(value,now=Date.now()){
 if(!value||!['search','chart','chain','option'].includes(value.action))throw Error('Unsupported market request');
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(value.id||''))throw Error('Invalid request ID');
 const action=value.action,query=txt(value.query,40).trim(),exchange=venues.includes(value.exchange)?value.exchange:'SMART';
 const result={id:value.id,action,createdAt:now,query,exchange,secType:value.secType==='FUT'?'FUT':'STK',currency:value.currency==='CAD'?'CAD':'USD',interval:['1m','5m','1h','1d'].includes(value.interval)?value.interval:'5m'};
 if(action==='search'&&!/^[\w .&/-]{1,40}$/.test(query))throw Error('Enter a symbol or company name');
 if(action==='search'&&result.secType==='FUT'&&exchange==='SMART')throw Error('Select a futures exchange');
 if(['chart','chain'].includes(action)){if(!Number.isSafeInteger(value.conId)||value.conId<=0)throw Error('Choose an IBKR contract');result.conId=value.conId;}
 if(action==='option'){
  if(!/^[A-Z0-9 .-]{1,20}$/.test(value.symbol||'')||!/^\d{8}$/.test(value.expiry||'')||!['C','P'].includes(value.right)||!Number.isFinite(value.strike)||value.strike<=0||value.strike>1e7||!/^\d{1,6}$/.test(String(value.multiplier||'')))throw Error('Choose an option contract');
  Object.assign(result,{symbol:value.symbol,expiry:value.expiry,strike:value.strike,right:value.right,multiplier:String(value.multiplier),tradingClass:txt(value.tradingClass,20)});
  if(!/^[\w .-]{0,20}$/.test(result.tradingClass))throw Error('Invalid trading class');
 }
 return result;
}
const contract=a=>a&&Number.isSafeInteger(a.conId)&&a.conId>0?{conId:a.conId,symbol:txt(a.symbol,60),name:txt(a.name),secType:txt(a.secType,8),exchange:txt(a.exchange,20),primaryExchange:txt(a.primaryExchange,20),currency:txt(a.currency,3),expiry:txt(a.expiry,8),right:txt(a.right,1),strike:num(a.strike),multiplier:txt(a.multiplier,8),tradingClass:txt(a.tradingClass,20)}:null;
export function sanitizeExplorer(x){
 if(!x||typeof x!=='object')return null;
 const out={requestId:txt(x.requestId,64),action:txt(x.action,12),status:txt(x.status,24),message:txt(x.message,240),asOf:num(x.asOf),interval:txt(x.interval,4),instrument:contract(x.instrument),results:(Array.isArray(x.results)?x.results:[]).slice(0,60).map(contract).filter(Boolean),bars:[],chains:[]};
 let prev=0;for(const b of (Array.isArray(x.bars)?x.bars:[]).slice(-300)){if(!Number.isSafeInteger(b?.time)||b.time<=prev||!['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high))continue;prev=b.time;out.bars.push({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:Number.isFinite(b.volume)&&b.volume>=0?b.volume:null});}
 out.chains=(Array.isArray(x.chains)?x.chains:[]).slice(0,6).map(c=>({exchange:txt(c.exchange,20),tradingClass:txt(c.tradingClass,20),multiplier:txt(c.multiplier,8),expiries:(Array.isArray(c.expiries)?c.expiries:[]).filter(v=>/^\d{8}$/.test(v)).slice(0,100),strikes:(Array.isArray(c.strikes)?c.strikes:[]).filter(v=>Number.isFinite(v)&&v>0).slice(0,1000)}));
 if(x.quote){out.quote={mode:txt(x.quote.mode,20),status:txt(x.quote.status,20)};for(const k of ['bid','ask','last','close','bidReceivedAt','askReceivedAt','lastReceivedAt'])out.quote[k]=num(x.quote[k]);}
 return out;
}
// One personal workspace queue, no more than one command every two seconds.
export const QUEUE_SCRIPT="local p=redis.call('GET',KEYS[1]); if p and tonumber(ARGV[1])-cjson.decode(p).createdAt<2000 then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',180); return 1";
