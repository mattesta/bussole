const fs=require('node:fs'),assert=require('node:assert/strict');
const stats=require('../account-statistics.js');
function storage(){const d={};return new Proxy(d,{get(t,k){if(k==='getItem')return key=>t[key]??null;if(k==='setItem')return (key,v)=>{t[key]=v};if(k==='removeItem')return key=>{delete t[key]};return t[k]}})}
(async()=>{
 global.window={BussoleAccountStatistics:stats};global.localStorage=storage();global.sessionStorage=storage();
 const {BussoleLocalGeometry:g}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('private-geometry-store.js','utf8')).toString('base64'));
 const shot=n=>({sampleId:'shot-'+n,generation:'g',day:20000,mode:'hard',kind:'solo',points:n,target:{lat:20,lon:30,label:'Target'},submission:{lat:48,lon:11,heading:90,distanceMeters:10000}});
 for(let n=900;n<906;n++)g.saveHighlight('owner','g',shot(n));
 assert.deepEqual(g.highlights(null,undefined),{});
 assert.equal(Object.keys(g.highlights('owner','g')).length,3);assert.equal(g.highlights('owner','g')['shot-905'].submission.lat,48);
 assert.deepEqual(g.highlights('other','g'),{});assert.deepEqual(g.highlights('owner','deleted-generation'),{});
 g.saveGuess('guest','ABCDEF',123,1,shot(1).submission);assert.equal(g.guess('guest','ABCDEF',123,1).lat,48);
 assert.equal(g.guess('other','ABCDEF',123,1),null);assert.equal(g.guess('guest','ABCDEF',124,1),null);
 const key=Object.keys(sessionStorage).find(k=>k.includes('match:guest'));const old=JSON.parse(sessionStorage.getItem(key));old.savedAt-=86400001;sessionStorage.setItem(key,JSON.stringify(old));assert.equal(g.guess('guest','ABCDEF',123,1),null);
 g.saveGuess('owner','ABCDEF',123,1,shot(1).submission);g.clear('owner');assert.deepEqual(g.highlights('owner','g'),{});assert.equal(g.guess('owner','ABCDEF',123,1),null);
 // Storage denial retains an in-memory replay without uploading anything.
 global.localStorage={getItem(){return null},setItem(){throw Error('quota')},removeItem(){}};
 assert.equal(g.saveHighlight('blocked','g',shot(999)),false);assert.equal(g.highlights('blocked','g')['shot-999'].points,999);g.clear('blocked');assert.deepEqual(g.highlights('blocked','g'),{});
 console.log('Local geometry: bounded highlights, account/generation/session isolation, expiry, deletion and storage-denial fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
