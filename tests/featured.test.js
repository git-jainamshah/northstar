import test from 'node:test';
import assert from 'node:assert/strict';
import {featuredAsset,featuredHTML} from '../dist/featured.js';
test('default markets remain visible offline without inventing prices or contracts',()=>{
 const html=featuredHTML({connected:false,assets:[]});for(const text of ['Stocks','ETFs','Futures','Options','RY','AAPL','MES','SPY near-money call'])assert.ok(html.includes(text));assert.match(html,/Offline/);assert.match(html,/disabled/);assert.doesNotMatch(html,/\$\d/);
});
test('featured futures resolve actual contracts and previous close is explicit',()=>{
 const a={category:'Futures',symbol:'MESZ6',conId:42,currency:'USD',mode:'delayed',close:7000},feed={connected:true,assets:[a]};assert.equal(featuredAsset(feed,'Futures','MES'),a);assert.match(featuredHTML(feed),/previous close/);assert.match(featuredHTML(feed),/Delayed/);
});
