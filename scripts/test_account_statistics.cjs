const assert=require('node:assert/strict');
const model=require('../account-statistics');
const sample=model.sample({points:850,angleError:-20,initialDistance:1000,errorMeters:100},{lat:1,lon:2,heading:5,distanceMeters:700},'hard','multiplayer',86400000*20000);
assert.deepEqual(sample,{day:20000,mode:'hard',kind:'multiplayer',points:850,relativeError:10,angleError:-20,distanceError:-30});
assert.doesNotMatch(JSON.stringify(sample),/"(?:lat|lon|heading|target|room|uid|email)":/);
const sanitized=model.clean({...sample,lat:1,target:'secret',email:'private@example.test',generation:'secret'});
assert.deepEqual(sanitized,sample);
const zero=model.sample({points:1000,angleError:null,initialDistance:0,errorMeters:0},{distanceMeters:10},'hard','solo');
assert.ok(!('relativeError' in zero));assert.ok(!('distanceError' in zero));assert.ok(!('angleError' in zero));
const rows=[sample,{...sample,day:19000,mode:'easy'},{...sample,angleError:20,distanceError:30}];
assert.equal(model.select(rows,{days:30,now:20000*86400000}).length,2);
assert.equal(model.select(rows,{mode:'easy'}).length,1);
let stats=model.summarize([sample,{...sample,angleError:20,distanceError:30}]);
assert.equal(stats.absoluteAngle,20);assert.equal(stats.absoluteDistance,30);assert.equal(stats.distanceBias,0);assert.equal(stats.angleBias,0);
assert.equal(stats.angleSamples[0].round,undefined);assert.equal(stats.angleSamples[0].target,undefined);
stats=model.summarize([{...sample,angleError:179},{...sample,angleError:-179}]);assert.equal(Math.abs(stats.angleBias),180);
assert.equal(model.summarize([{...sample,angleError:90},{...sample,angleError:-90}]).angleBias,null);
assert.equal(model.clean({...sample,mode:'invalid'}),null);
console.log('Device statistics: scalar projection, filters, circular means and highlights passed.');

const shotBase={day:100,mode:'hard',kind:'solo',points:900,relativeError:5,angleError:10};
const best=require('../account-statistics.js').bestShots([{...shotBase,points:1000,mode:'easy'},{...shotBase,points:899},{...shotBase,relativeError:2},{...shotBase,points:999},{...shotBase,relativeError:3}]);
assert.deepEqual(best.map(s=>s.points),[999,900,900]);assert.deepEqual(best.slice(1).map(s=>s.relativeError),[2,3]);

const replay={submission:{lat:48,lon:11,heading:90,distanceMeters:20000,secret:'omit'},target:{lat:45,lon:12,label:'Venice',secret:'omit'}};
assert.equal(model.shotGeometry(replay).target.label,'Venice');assert.doesNotMatch(JSON.stringify(model.shotGeometry(replay)),/secret/);
assert.equal(model.shotGeometry({...replay,submission:{...replay.submission,lat:91}}),null);
assert.equal(model.shotGeometry({...replay,target:{...replay.target,label:''}}),null);
