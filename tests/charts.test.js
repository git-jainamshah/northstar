import test from 'node:test';
import assert from 'node:assert/strict';
import {chartGeometry,selectRange,chartHTML} from '../dist/charts.js';
test('chart time axis preserves unequal gaps between worker cycles',()=>{const g=chartGeometry([{points:[{time:1000,value:100},{time:2000,value:99},{time:11000,value:101}]}]);assert.equal((g.x(2000)-g.x(1000))/(g.x(11000)-g.x(1000)),0.1);});
test('zero equity remains a real observation, null valuations do not become zero',()=>{const g=chartGeometry([{points:[{time:1,value:100},{time:2,value:null},{time:3,value:0}]}]);assert.ok(g.low<0);assert.ok(g.high>100);assert.equal(chartGeometry([{points:[{time:1,value:null}]}]),null);});
test('flat and single-observation curves have finite coordinates',()=>{const g=chartGeometry([{points:[{time:1,value:100}]}]);assert.ok(Number.isFinite(g.x(1)));assert.ok(Number.isFinite(g.y(100)));});
test('timeframe filters use clock time, not the number of samples',()=>{const now=100*3600000;assert.deepEqual(selectRange([{time:now-25*3600000},{time:now-2*3600000}], '1D',now),[{time:now-2*3600000}]);});
test('missing history has an honest empty state, not a synthetic curve',()=>{const html=chartHTML([{name:'Account',points:[]}]);assert.match(html,/No observations/);assert.doesNotMatch(html,/<path/);});
