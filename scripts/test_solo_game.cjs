const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('solo-game.js','utf8'),c);
const api=c.window.BussoleSoloGame;
const catalogue=Array.from({length:10},(_,i)=>({lat:i,lon:i*2,name:`Place ${i}`,country:'Country',category:['capital','city','landmark'][i%3]}));
const game=api.create(catalogue,{mode:'hard',timerSeconds:3,blurEnabled:true},()=>.1);
assert.equal(game.round,1);assert.equal(game.total,0);assert.equal(game.next(),false);
const chosen=[];
for(let round=1;round<=5;round++){
 assert.equal(game.round,round);assert.equal(game.phase,'aiming');const target=game.target;chosen.push(target.label);
 assert.equal(game.finish(round===3?null:{lat:1,lon:2,heading:20,distanceMeters:100},round===3?0:800),true);
 assert.equal(game.target.label,target.label);assert.equal(game.round,round);assert.equal(game.finish(null,1000),false);
 if(round<5){assert.equal(game.phase,'revealed');assert.equal(game.next(),true);}
}
assert.equal(new Set(chosen).size,5);assert.equal(game.phase,'finished');assert.equal(game.total,3200);assert.equal(game.next(),false);assert.equal(game.finish(null,1000),false);
assert.equal(game.results.length,5);assert.equal(game.results[2].submission,null);
const result=game.results;result[0].submission.lat=99;assert.equal(game.results[0].submission.lat,1);
assert.equal(api.key({mode:'hard',timerSeconds:3,blurEnabled:true}),'hard-t3-b1');
assert.notEqual(api.key({mode:'hard'}),api.key({mode:'medium'}));assert.notEqual(api.key({mode:'hard',timerSeconds:3}),api.key({mode:'hard',timerSeconds:4}));
assert.equal(api.settings({mode:'wrong',timerSeconds:2}).mode,'medium');assert.equal(api.settings({timerSeconds:2}).timerSeconds,0);
assert.throws(()=>api.create(catalogue.slice(0,4)),/catalogue/);
const duplicate=[...catalogue.slice(0,4),{...catalogue[0],name:'Duplicate'}];assert.throws(()=>api.create(duplicate),/catalogue/);
console.log('Five-round solo game: distinct catalogue targets, no skips/double submissions, DNF zero, exact finish, immutable results and comparable record settings passed.');
