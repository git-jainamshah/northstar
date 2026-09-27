// Personal research simulator. This module has no broker execution capability.
export const RULES=Object.freeze({capital:10000,maxPremium:1000,feeUSD:1,slippage:0.001,horizon:300000,cooldown:60000,maxSpread:0.05,stop:0.10,target:0.15,dailyLoss:300,drawdown:500});
const finite=Number.isFinite;
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function initialOptions(now=Date.now()){
 return {version:1,createdAt:now,asOf:now,initialCash:RULES.capital,cash:RULES.capital,equity:RULES.capital,peak:RULES.capital,realizedPnl:0,fees:0,totals:{closed:0,wins:0,matched:0,predicted:0,actual:0,directionCorrect:0},position:null,pending:null,trades:[],history:[],samples:{},plans:[],lastExit:0,day:'',dayEquity:RULES.capital,halted:false,status:'waiting',reason:'Waiting for the first live option quote.',valuationStale:false};
}
export function liquidBook(a,feed,now,age=10000){
 return Boolean(feed?.connected&&a?.mode==='live'&&!a.error&&finite(a.bid)&&finite(a.ask)&&a.bid>0&&a.ask>=a.bid&&finite(a.bidReceivedAt)&&finite(a.askReceivedAt)&&Math.max(a.bidReceivedAt,a.askReceivedAt)<=now&&now-Math.min(a.bidReceivedAt,a.askReceivedAt)<=age);
}
function optionBook(a,feed,now,active=false){
 const allowed=active&&a?.mode==='delayed'&&(!a.error||[10167,10091,354].includes(a.errorCode));
 const book=allowed?liquidBook({...a,mode:'live',error:null},feed,now,120000):liquidBook(a,feed,now);
 return book&&['bidSize','askSize'].every(k=>Number.isFinite(a[k])&&a[k]>=1&&Number.isFinite(a[k+'ReceivedAt'])&&a[k+'ReceivedAt']<=now&&now-a[k+'ReceivedAt']<=(active?120000:10000));
}
function session(now){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));return {day:parts.year+parts.month+parts.day,minute:Number(parts.hour)*60+Number(parts.minute),weekday:parts.weekday};}
function open(now){const s=session(now);return !['Sat','Sun'].includes(s.weekday)&&s.minute>=570&&s.minute<955;}
function entryCost(a,fx){return (a.ask*(1+RULES.slippage)*100+RULES.feeUSD)*fx.ask;}
function proceeds(a,fx){return Math.max(0,(a.bid*(1-RULES.slippage)*100-RULES.feeUSD)*fx.bid);}
function fill(s,a,fx,side,now,reason){
 const cost=side==='BUY'?entryCost(a,fx):proceeds(a,fx),price=side==='BUY'?a.ask*(1+RULES.slippage):a.bid*(1-RULES.slippage);
 const trade={time:now,side,symbol:a.symbol,conId:a.conId,qty:1,price,fx:side==='BUY'?fx.ask:fx.bid,fee:RULES.feeUSD*(side==='BUY'?fx.ask:fx.bid),value:cost,reason,mode:a.mode,pnl:null};
 if(side==='BUY'){
  const plan=s.plans.find(p=>p.conId===a.conId);
  s.cash-=cost;s.position={conId:a.conId,symbol:a.symbol,expiry:a.expiry,qty:1,multiplier:100,mode:a.mode,right:a.right,cost,openedAt:now,dueAt:now+RULES.horizon,predictedPnl:plan?.expectedPnl??null,mark:proceeds(a,fx)};
 }else{
  const p=s.position;trade.pnl=cost-p.cost;trade.predictedPnl=p.predictedPnl;trade.matched=reason==='5-minute exit'&&now-p.dueAt<=10000;
  s.totals.closed++;if(trade.pnl>0)s.totals.wins++;if(trade.matched&&finite(trade.predictedPnl)){s.totals.matched++;s.totals.predicted+=trade.predictedPnl;s.totals.actual+=trade.pnl;if((trade.predictedPnl>0)===(trade.pnl>0))s.totals.directionCorrect++;}
  s.cash+=cost;s.realizedPnl+=trade.pnl;s.position=null;s.lastExit=now;
 }
 s.fees+=trade.fee;s.trades.push(trade);s.trades=s.trades.slice(-1000);s.pending=null;
}
function projection(a,points,fx,now,active=false){
 const base={conId:a.conId,symbol:a.symbol,issuedAt:now,expectedPnl:null,lowPnl:null,highPnl:null,reason:active?'Collecting 30 seconds of observed quotes':'Collecting 2 minutes of live quotes',ready:false};
 if(points.length<(active?4:13)||points.at(-1).time-points[0].time<(active?30000:120000))return base;
 const returns=points.slice(1).map((p,i)=>p.mid/points[i].mid-1),drift=Math.max(-0.1,Math.min(0.1,(points.at(-1).mid/points[0].mid-1)*RULES.horizon/(points.at(-1).time-points[0].time)));
 const vol=Math.sqrt(mean(returns.map(r=>(r-mean(returns))**2)))*Math.sqrt(RULES.horizon/10000);
 const cost=entryCost(a,fx),net=r=>(Math.max(0,a.bid*(1+r))*(1-RULES.slippage)*100-RULES.feeUSD)*fx.bid-cost;
 return {...base,ready:true,expectedPnl:net(drift),lowPnl:net(Math.max(-1,drift-2*vol)),highPnl:net(drift+2*vol),cost,reason:net(drift)>2?'Positive projected edge':'Projected edge does not cover costs'};
}
export function stepOptions(s,feed,now=Date.now(),{active=false}={}){
 s.policy=active?'Active research · delayed quotes allowed':'Live momentum';
 s.exploration=s.exploration||{day:'',count:0,last:0};
 const today=session(now).day;if(s.exploration.day!==today)s.exploration={day:today,count:0,last:s.exploration.last};
 const exploratory=active&&s.exploration.count<4&&now-s.exploration.last>=1800000;
 s.asOf=now;s.plans=[];
 const assets=feed?.assets||[],fx=assets.find(a=>a.category==='FX'&&a.currency==='CAD'),fxOK=liquidBook(fx,feed,now,120000);
 const options=assets.filter(a=>a.category==='Options'&&a.currency==='USD'&&['C','P'].includes(a.right)&&Number(a.multiplier)===100);
 const live=options.filter(a=>optionBook(a,feed,now,active));
 const day=session(now).day;
 for(const a of options){
  let points=s.samples[a.conId]||[];
  if(s.sampleModes?.[a.conId]!==a.mode){points=[];s.samples[a.conId]=points;s.sampleModes={...s.sampleModes,[a.conId]:a.mode};}
  if(!optionBook(a,feed,now,active)){s.samples[a.conId]=[];s.plans.push({conId:a.conId,symbol:a.symbol,reason:!active&&a.mode!=='live'?'Live options subscription required':'Waiting for a valid bid, ask and contract size',ready:false});continue;}
  if(points.length&&now-points.at(-1).time>20000)points=[];
  if(!points.length||now-points.at(-1).time>=10000)points.push({time:now,mid:(a.bid+a.ask)/2});
  points=points.filter(p=>now-p.time<=130000);s.samples[a.conId]=points;
  const plan=fxOK?projection(a,points,fx,now,active):{conId:a.conId,symbol:a.symbol,ready:false,reason:'Waiting for live USD/CAD conversion'};
  if(plan.ready&&(a.ask-a.bid)/a.ask>RULES.maxSpread){plan.ready=false;plan.reason='Spread exceeds 5%';}
  if(plan.ready&&plan.cost>Math.min(s.cash,RULES.maxPremium)){plan.ready=false;plan.reason='One contract exceeds the CAD $1,000 position limit';}
  if(a.expiry<=day){plan.ready=false;plan.reason='Expiry-day entry disabled';}
  plan.mode=a.mode;plan.exploratory=Boolean(plan.ready&&exploratory&&plan.expectedPnl<=2&&plan.expectedPnl>=-plan.cost*.02);if(plan.exploratory)plan.reason='Exploration entry — no predicted profit required';
  s.plans.push(plan);
 }
 for(const key of Object.keys(s.samples))if(!options.some(a=>String(a.conId)===key))delete s.samples[key];
 const held=s.position&&options.find(a=>a.conId===s.position.conId),canMark=s.position&&optionBook(held,feed,now,active)&&held.mode===(s.position.mode||'live')&&fxOK;
 s.valuationStale=Boolean(s.position&&!canMark);
 if(canMark)s.position.mark=proceeds(held,fx);
 s.equity=s.cash+(s.position?.mark||0);
 if(s.day!==day&&!s.valuationStale){s.day=day;s.dayEquity=s.equity;}
 s.peak=Math.max(s.peak,s.equity);s.maxDrawdown=Math.max(s.maxDrawdown||0,(s.peak-s.equity)/s.peak);
 if(!s.valuationStale&&(s.dayEquity-s.equity>=RULES.dailyLoss||s.peak-s.equity>=RULES.drawdown))s.halted=true;
 let reason=!feed?.connected?'Cannot connect to Gateway':!options.length?'Waiting for an option contract':!live.length?(active?'Waiting for an actual option bid / ask':'Waiting for live option bid / ask'):!fxOK?'Waiting for live USD/CAD conversion':!open(now)?'Outside the options trading session':s.halted?'Risk limit reached — entries paused':'Waiting for a positive edge after costs';
 if(s.pending){
  const intent=s.pending,a=options.find(a=>a.conId===intent.conId);
  // Entry and exit both require a later two-sided quote; never fill on the decision tick.
  const later=optionBook(a,feed,now,active)&&fxOK&&Math.min(a.bidReceivedAt,a.askReceivedAt)>intent.time;
  if(now-intent.time>30000){s.pending=null;reason='Order expired while waiting for a fresh quote';}
  else if(now-intent.time>=1000&&later){
   if(intent.side==='SELL'&&s.position&&a.mode===(s.position.mode||'live'))fill(s,a,fx,'SELL',now,intent.reason);
   else if(intent.side==='BUY'&&!s.position){const plan=s.plans.find(p=>p.conId===a.conId);if(open(now)&&!s.halted&&plan?.ready&&(plan.expectedPnl>2||plan.exploratory)&&a.expiry>day&&a.mode===intent.mode){fill(s,a,fx,'BUY',now,plan.exploratory?'Exploration sample':'Momentum signal');if(plan.exploratory){s.exploration.count++;s.exploration.last=now;}}else s.pending=null;}
  }
 }
 if(s.position&&!s.pending){
  const p=s.position,pnl=p.mark-p.cost,exitReason=s.halted?'Risk stop':day>=p.expiry?'Expiry protection':session(now).minute>=955?'Session close':now>=p.dueAt?'5-minute exit':pnl<=-p.cost*RULES.stop?'10% stop':pnl>=p.cost*RULES.target?'15% target':null;
  if(exitReason&&canMark)s.pending={side:'SELL',conId:p.conId,time:now,reason:exitReason};
  reason=!canMark?'Position valuation stale — waiting for matching feed quotes':exitReason?`Exit pending: ${exitReason}`:'Position open — monitoring every second';
 }else if(!s.position&&!s.pending&&open(now)&&!s.halted&&fxOK&&now-s.lastExit>=RULES.cooldown){
  const plan=s.plans.filter(p=>p.ready&&(p.expectedPnl>2||p.exploratory)).sort((a,b)=>b.expectedPnl-a.expectedPnl)[0];
  if(plan){s.pending={side:'BUY',conId:plan.conId,mode:plan.mode,time:now,reason:plan.exploratory?'Exploration sample':'Positive projected edge'};reason='Paper entry queued — waiting for next quote';}
 }
 s.equity=s.cash+(s.position?.mark||0);s.status=s.position?'position-open':s.pending?'order-pending':'waiting';s.reason=reason;
 if(!s.history.length||now-s.history.at(-1).time>=10000){s.history.push({time:now,equity:s.valuationStale?null:s.equity});s.history=s.history.slice(-2160);}
 return s;
}
export function optionsReport(s){
 const totals=s.totals;
 return {version:1,asOf:s.asOf,createdAt:s.createdAt,maxDrawdown:s.maxDrawdown||0,policy:s.policy,explorationCount:s.exploration?.count||0,initialCash:s.initialCash,cash:s.cash,equity:s.equity,realizedPnl:s.realizedPnl,pnl:s.equity-s.initialCash,fees:s.fees,position:s.position,pending:s.pending,status:s.status,reason:s.reason,valuationStale:s.valuationStale,halted:s.halted,plans:s.plans,history:s.history.slice(-240),trades:s.trades.slice(-40),closed:totals.closed,winRate:totals.closed?totals.wins/totals.closed:null,matched:totals.matched,predictedPnl:totals.matched?totals.predicted:null,actualMatchedPnl:totals.matched?totals.actual:null,directionAccuracy:totals.matched?totals.directionCorrect/totals.matched:null};
}
