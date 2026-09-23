export function projectGrowth(initial,monthly,years,annualRate){
 if (![initial,monthly,years,annualRate].every(Number.isFinite)||initial<0||monthly<0||years<1||years>50||annualRate<=-100) throw new Error('Enter valid amounts, a term of 1–50 years, and a return above -100%.');
 const rate=Math.pow(1+annualRate/100,1/12)-1;let balance=initial;const points=[initial];
 for(let m=1;m<=Math.round(years*12);m++){balance=balance*(1+rate)+monthly;if(m%12===0)points.push(balance)}
 return {balance,contributions:initial+monthly*Math.round(years*12),points};
}
export function roundTrip(amount,returnPct,feePct){
 if (![amount,returnPct,feePct].every(Number.isFinite)||amount<0||returnPct< -100||feePct<0||feePct>=100)throw new Error('Invalid fee scenario');
 const factor=1-feePct/100,gross=amount*(1+returnPct/100),net=gross*factor*factor;
 return {gross,net,cost:gross-net,profit:net-amount,breakEven:(1/(factor*factor)-1)*100};
}
export function signals(prices){
 if(!Array.isArray(prices)||prices.length<21||prices.some(p=>!Number.isFinite(p)||p<=0))return null;
 const returns=prices.slice(1).map((p,i)=>p/prices[i]-1);const mean=returns.reduce((s,x)=>s+x,0)/returns.length;
 const variance=returns.reduce((s,x)=>s+(x-mean)**2,0)/(returns.length-1);
 return {momentum:(prices.at(-1)/prices.at(-21)-1)*100,volatility:Math.sqrt(variance)*Math.sqrt(252)*100,drawdown:prices.reduce((s,p)=>{s.peak=Math.max(s.peak,p);s.worst=Math.min(s.worst,p/s.peak-1);return s},{peak:prices[0],worst:0}).worst*100};
}
