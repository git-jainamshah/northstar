// Online logistic regression. Chronological predict -> score -> learn.
// Once warmed up (see CONFIG.shadowWarmupSamples), lib/engine.js uses this score to gate NEW entries only:
// a trend-rule buy is skipped if predicted confidence is too low. It never influences exits, position sizing, or risk stops.
const sigmoid=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
const clamp=v=>Math.max(-3,Math.min(3,v));
export function features(bars,i){if(i<24)return null;const r=n=>(bars[i].close/bars[i-n].close-1)*100;return [1,clamp(r(1)),clamp(r(6)),clamp(r(24))]}
export function predict(weights,x){return sigmoid(weights.reduce((s,w,i)=>s+w*x[i],0))}
export function updateLearning(previous,bars){
 const model=previous?structuredClone(previous):{version:'online-logistic-v1',weights:[0,0,0,0],trainedThrough:0,samples:0,scored:0,correct:0,brierSum:0,baselineBrierSum:0,gapResets:0,latest:null};
 if(model.trainedThrough&&bars[0].time>model.trainedThrough)model.gapResets++;
 for(let i=25;i<bars.length;i++){
  if(bars[i].time<=model.trainedThrough)continue;
  const x=features(bars,i-1),y=Number(bars[i].close>bars[i-1].close),p=predict(model.weights,x);
  if(model.samples>=100){model.scored++;model.correct+=Number((p>=.5?1:0)===y);model.brierSum+=(p-y)**2;model.baselineBrierSum+=(.5-y)**2}
  const step=.025/Math.sqrt(1+model.samples/100);model.weights=model.weights.map((w,j)=>w-step*((p-y)*x[j]+(j?.002*w:0)));model.samples++;model.trainedThrough=bars[i].time;
 }
 model.latest={barTime:bars.at(-1).time,upwardScore:predict(model.weights,features(bars,bars.length-1)),calibrated:false};
 return model;
}
export function modelReport(model){return {version:model.version,samples:model.samples,scored:model.scored,directionalAccuracy:model.scored?model.correct/model.scored:null,brier:model.scored?model.brierSum/model.scored:null,baselineBrier:model.scored?model.baselineBrierSum/model.scored:null,upwardScore:model.latest?.upwardScore??null,role:'entry gate',note:'Uncalibrated next-hour direction score; not a probability of profit. Historical prequential scores include initial warm-up history. Gates new trend-rule entries once warmed up; never controls exits, sizing, or asset selection.'}}
