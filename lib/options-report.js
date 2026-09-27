// Explicit allowlist: only fictional research-account results may leave this Mac.
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const text=v=>typeof v==='string'?v.slice(0,180):'';
function fields(value,nums=[],strings=[],bools=[]){if(!value||typeof value!=='object')return null;return {...Object.fromEntries(nums.map(k=>[k,number(value[k])])),...Object.fromEntries(strings.map(k=>[k,text(value[k])])),...Object.fromEntries(bools.map(k=>[k,value[k]===true]))};}
export function sanitizeResearch(s,now=Date.now()){
 if(!s||s.version!==1||s.initialCash!==10000||!Number.isSafeInteger(s.asOf)||s.asOf>now+5000)return null;
 const result=fields(s,['createdAt','maxDrawdown','explorationCount','asOf','initialCash','cash','equity','realizedPnl','pnl','fees','closed','winRate','matched','predictedPnl','actualMatchedPnl','directionAccuracy'],['status','reason','policy'],['valuationStale','halted']);
 if(['cash','equity','realizedPnl','fees'].some(k=>result[k]===null))return null;
 result.version=1;
 result.position=fields(s.position,['conId','qty','multiplier','cost','openedAt','dueAt','predictedPnl','mark'],['symbol','expiry','mode','right']);
 result.pending=fields(s.pending,['conId','time'],['side','reason','mode']);
 result.plans=(Array.isArray(s.plans)?s.plans:[]).slice(0,8).map(p=>fields(p,['conId','issuedAt','expectedPnl','lowPnl','highPnl','cost'],['symbol','reason','mode'],['ready','exploratory']));
 result.trades=(Array.isArray(s.trades)?s.trades:[]).slice(-40).map(t=>fields(t,['time','conId','qty','price','fx','fee','value','pnl','predictedPnl'],['symbol','side','reason','mode'],['matched']));
 result.history=(Array.isArray(s.history)?s.history:[]).slice(-240).filter(p=>Number.isSafeInteger(p?.time)&&p.time<=s.asOf).map(p=>({time:p.time,equity:number(p.equity)}));
 return result;
}
