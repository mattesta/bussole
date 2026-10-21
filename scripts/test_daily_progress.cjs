const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},Intl});vm.runInContext(fs.readFileSync('daily-progress.js','utf8'),context);
const api=context.window.BussoleDailyProgress,calc=api.calculate;
assert.equal(calc({},100).km,0);assert.equal(calc({},100).started,false);
assert.equal(calc({100:{score:5000}},100).km,500);assert.equal(calc({100:{score:5000}},101).km,500);assert.equal(calc({100:{score:5000}},102).km,0);
assert.equal(calc({100:{score:4000},102:{score:1000}},102).km,100); // clamp before the new credit, not after.
assert.equal(calc({100:{score:1}},101).km,.1);assert.equal(calc({100:{score:0}},102).km,0);
const history={103:{score:1000},100:{score:4500},101:{score:5000}};
assert.equal(calc(history,104).km,550);assert.equal(calc(history,105).km,50);assert.equal(calc(history,106).km,0);
assert.equal(calc(history,105).missedDays,2);assert.equal(calc(history,104).earnedTodayKm,0);
assert.equal(calc({100:{score:5000},101:{score:0}},102).km,500); // completing for zero still counts as playing.
assert.equal(calc({100:{score:5000},101:{startedAt:123}},102).km,0); // abandoned attempt is missed.
assert.equal(calc({99:{score:5001},98:{score:'1000'},97:{score:-1},96:{score:2.5},95:null,102:{score:5000}},100).started,false);
assert.equal(calc({100:{score:5000,generation:'old'},101:{score:1000,generation:'new'}},101,'new').km,100);
assert.equal(calc({100:{score:5000},101:{score:5000}},100).km,500); // no future credit.
assert.equal(calc({100:{score:5000}},10000).km,0);assert.equal(calc({100:{score:5000}},10000).missedDays,9899);
const laps=Object.fromEntries(Array.from({length:100},(_,i)=>[i,{score:5000}]));assert.equal(calc(laps,100).km,50000);assert.ok(calc(laps,100).percent>100);
assert.equal(api.EARTH_KM,40075);assert.equal(calc({100:{score:5000}},100).percent,500/40075*100);
// Compare the gap-based calculation against a simple day-by-day wallet over many histories.
let seed=12345;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let i=0;i<200;i++){
 const rows={};for(let day=100;day<=130;day++)if(random()<.6)rows[day]={score:Math.floor(random()*5001)};
 const now=130,days=Object.keys(rows).map(Number).sort((a,b)=>a-b);let balance=0;
 if(days.length)for(let day=days[0];day<=now;day++){if(rows[day])balance+=rows[day].score;else if(day<now)balance=Math.max(0,balance-5000);}
 assert.equal(calc(rows,now).km,balance/10);
}
assert.throws(()=>calc({},-1),/UTC day/);
console.log('Daily journey: linear/tenth-km rewards, chronological capped penalties, no pre-start/today penalty, zero/DNF and abandoned days, generations, UTC gaps, future filtering, multiple laps and 200 reference histories passed.');
