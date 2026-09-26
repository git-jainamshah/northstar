import {resolve} from 'node:path';
import {sanitizeResearch} from './options-report.js';
import {readFile} from 'node:fs/promises';

export function normalizeIBKR(snapshot, now=Date.now(), maxWorkerAgeMs=10000) {
  if (snapshot?.schemaVersion!==1 || !Array.isArray(snapshot.assets) || !Number.isFinite(snapshot.asOf)) throw new Error('Invalid IBKR snapshot');
  const connected=snapshot.connected===true && now-snapshot.asOf>=0 && now-snapshot.asOf<maxWorkerAgeMs;
  return {...snapshot,enabled:true,connected,status:connected?'connected':now<snapshot.asOf?'clock-error':now-snapshot.asOf>=maxWorkerAgeMs?'worker-offline':snapshot.status,
    assets:snapshot.assets.map(a=>{
      const valid=Number.isFinite(a.bid)&&Number.isFinite(a.ask)&&a.bid>0&&a.ask>=a.bid;
      const receivedAt=Number.isFinite(a.bidReceivedAt)&&Number.isFinite(a.askReceivedAt)?Math.min(a.bidReceivedAt,a.askReceivedAt):null;
      const fresh=valid&&receivedAt!==null&&Math.max(a.bidReceivedAt,a.askReceivedAt)<=now&&now-receivedAt<=120000;
      const mode=['live','delayed','frozen','delayed-frozen'].includes(a.mode)?a.mode:'unknown';
      return {...a,mode,receivedAt,status:!connected?'disconnected':!valid?'unavailable':!fresh?'stale':mode,
        eligibleForSimulation:connected&&fresh&&mode==='live'&&!a.error};
    })};
}

export async function localIBKR(path) {
  try{const feed=normalizeIBKR(JSON.parse(await readFile(path,'utf8')));try{feed.research=sanitizeResearch(JSON.parse(await readFile(resolve('.runtime/options-report.json'),'utf8')))}catch{}return feed}
  catch{return {enabled:true,connected:false,status:'worker-offline',readOnly:true,execution:'disabled',assets:[],events:[],discovery:{},note:'Start npm run ibkr to connect the local gateway.'}}
}
