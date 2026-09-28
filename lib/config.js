export const CONFIG = Object.freeze({initialCash:100,currency:'CAD',strategyVersion:'trend-v1',maxPositionCad:20,maxExposureCad:40,minCashCad:60,maxSpreadBps:35,slippageBps:10,feeBps:40,maxQuoteAgeMs:120000,maxBarAgeMs:5400000,stopLossPct:0.03,takeProfitPct:0.06,maxDailyLossCad:2,maxDrawdownPct:0.05,cooldownMs:21600000,barIntervalMinutes:60,
 // Once the shadow learner has enough samples to be minimally meaningful (matches its own scoring warm-up in lib/learning.js),
 // a new entry additionally requires its predicted upward probability to clear this bar. Never gates exits/stops/sizing.
 shadowWarmupSamples:100,minShadowConfidence:0.55});
export const ASSETS = [
 {id:'BTC/CAD',pair:'XBTCAD',name:'Bitcoin',assetClass:'crypto',currency:'CAD'},
 {id:'ETH/CAD',pair:'ETHCAD',name:'Ethereum',assetClass:'crypto',currency:'CAD'}
];
export const COVERAGE = [
 {market:'Canada',assetClass:'Stocks & ETFs',status:'unavailable',reason:'No licensed Canadian equity feed connected. No synthetic substitution.'},
 {market:'United States',assetClass:'Stocks & ETFs',status:'unavailable',reason:'No U.S. equity feed connected. Free pilot currently covers CAD crypto only.'},
 {market:'Canada & U.S.',assetClass:'Options',status:'unavailable',reason:'Requires live chains, contract multipliers, expiry, exercise rules, spreads, and feed entitlements. No fractional contracts.'},
 {market:'Canada & U.S.',assetClass:'Futures',status:'blocked',reason:'No futures feed or verified margin schedule. Leverage is disabled for the CAD $100 pilot.'},
 {market:'Kraken CAD pairs',assetClass:'Spot crypto',status:'connected',reason:'Public top-of-book and completed hourly candles. Venue-specific data, not consolidated pricing.'}
];
