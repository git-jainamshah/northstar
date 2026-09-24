// Experimental return projection. A direction score is not a calibrated profit probability.
const HOUR=3600000, TOLERANCE=120000;
export function makeForecast(a,model,config,now){
 const p=model?.latest?.upwardScore;
 if(!Number.isFinite(p)||!a.bars?.length||!(a.ask>0)||!(a.bid>0))return null;
 const closes=a.bars.slice(-121).map(b=>b.close),returns=closes.slice(1).map((v,i)=>v/closes[i]-1).filter(Number.isFinite);
 if(returns.length<50)return null;
 const positive=returns.filter(r=>r>0),negative=returns.filter(r=>r<=0),avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
 const expectedReturn=p*avg(positive)+(1-p)*avg(negative),ordered=[...returns].sort((a,b)=>a-b);
 const low=ordered[Math.floor((ordered.length-1)*.05)],high=ordered[Math.floor((ordered.length-1)*.95)];
 const fee=config.feeBps/10000,slip=config.slippageBps/10000,budget=config.maxPositionCad;
 const qty=Math.floor(budget/(a.ask*(1+slip)*(1+fee))*10**a.precision)/10**a.precision;
 const cost=qty*a.ask*(1+slip)*(1+fee),mid=(a.ask+a.bid)/2,halfSpread=(a.ask-a.bid)/2;
 const pnl=r=>qty*Math.max(0,mid*(1+r)-halfSpread)*(1-slip)*(1-fee)-cost;
 return {id:`${now}-${a.id}`,asset:a.id,issuedAt:now,dueAt:now+HOUR,status:'pending',modelVersion:model.version,upwardScore:p,expectedReturn,lowReturn:low,highReturn:high,expectedPnl:pnl(expectedReturn),lowPnl:pnl(low),highPnl:pnl(high),qty,cost,referenceMid:mid,fee,slip,eligibleSize:qty>=a.minQty&&qty*a.ask>=a.minCost,toleranceMs:TOLERANCE,role:'shadow',horizonMs:HOUR};
}
export function updateForecasts(s,assets,now){
 s.forecasts??=[];
 for(const f of s.forecasts){if(f.status!=='pending'||now<f.dueAt)continue;const a=assets.find(a=>a.id===f.asset);
  if(now>f.dueAt+TOLERANCE){f.status='expired';f.reason='No valid quote within two minutes of the one-hour target';continue;}
  if(!a||a.observedAt<f.dueAt||a.observedAt>now+5000)continue;
  const mid=(a.bid+a.ask)/2;f.observedAt=now;f.actualReturn=mid/f.referenceMid-1;f.actualPnl=f.qty*a.bid*(1-f.slip)*(1-f.fee)-f.cost;f.directionCorrect=(f.upwardScore>=.5)===(f.actualReturn>0);f.absoluteReturnError=Math.abs(f.expectedReturn-f.actualReturn);f.status='scored';
 }
 const current={};for(const a of assets){const f=makeForecast(a,s.models[a.id],s.config,now);if(f){s.forecasts.push(f);current[a.id]=f;}}
 s.forecasts=s.forecasts.slice(-4000);return current;
}
export function forecastReport(s){
 const forecasts=s.forecasts||[],scored=forecasts.filter(f=>f.status==='scored'),closed=s.trades.filter(t=>t.side==='SELL'&&Number.isFinite(t.pnl));
 const matched=closed.filter(t=>t.entryForecast&&Number.isFinite(t.entryForecast.expectedPnl)&&Math.abs(t.time-t.entryForecast.dueAt)<=TOLERANCE);
 const sum=(xs,key)=>xs.reduce((n,x)=>n+x[key],0);
 return {latest:Object.values(Object.fromEntries(forecasts.map(f=>[f.asset,f]))),recent:forecasts.slice(-20).reverse(),pending:forecasts.filter(f=>f.status==='pending').length,expired:forecasts.filter(f=>f.status==='expired').length,scored:scored.length,directionalAccuracy:scored.length?scored.filter(f=>f.directionCorrect).length/scored.length:null,meanAbsoluteReturnError:scored.length?sum(scored,'absoluteReturnError')/scored.length:null,scenarioExpectedPnl:scored.length?sum(scored,'expectedPnl'):null,scenarioObservedPnl:scored.length?sum(scored,'actualPnl'):null,closedTrades:closed.length,profitableTrades:closed.filter(t=>t.pnl>0).length,tradeWinRate:closed.length?closed.filter(t=>t.pnl>0).length/closed.length:null,matchedTrades:matched.length,predictedTradePnl:matched.length?matched.reduce((n,t)=>n+t.entryForecast.expectedPnl,0):null,realizedMatchedPnl:matched.length?sum(matched,'pnl'):null,retention:'Latest 4,000 forecasts and retained trade journal; no backfilled predictions',note:'Experimental one-hour return estimates from a direction score and recent hourly returns. Scenario range is historical, not a confidence interval. Forward quote-based outcomes are simulated opportunities, not executed trades.'};
}
