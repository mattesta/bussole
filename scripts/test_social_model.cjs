const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),c={window:{}};for(const f of ['daily-progress.js','account-statistics.js','social-model.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),c);const api=c.window.BussoleSocialModel;
assert.equal(api.balance({asOfDay:100,tenths:7000,lastDay:100},101).km,700);assert.equal(api.balance({asOfDay:100,tenths:7000,lastDay:100},102).km,600);assert.equal(api.balance({asOfDay:100,tenths:7000,lastDay:99},101).km,600);assert.equal(api.balance({asOfDay:100,tenths:100,lastDay:99},200).km,0);assert.equal(api.balance({asOfDay:101,tenths:5000,lastDay:101},100),null);
const rank=api.ranked({a:{name:'A',asOfDay:100,tenths:7000,lastDay:100},b:{name:'B',asOfDay:100,tenths:2000,lastDay:100},c:{name:'C',asOfDay:100,tenths:2000,lastDay:100}},102);assert.equal(rank[0].uid,'a');assert.equal(rank[1].rank,2);assert.equal(rank[2].rank,2);
const snapshot=api.snapshot({profile:{generation:'new',username:'test',email:'secret'},samples:{old:{day:100,mode:'hard',kind:'solo',points:1,generation:'old'},current:{day:100,mode:'hard',kind:'solo',points:700,angleError:20,generation:'new',lat:42,target:'secret'}},dailyAttempts:{100:{score:5000,generation:'new',entryKey:'private'}},soloBests:{}},100);
assert.equal(snapshot.samples.length,1);assert.equal(snapshot.journey.tenths,5000);assert.doesNotMatch(JSON.stringify(snapshot),/email|entryKey|target|lat|current|secret/);
console.log('Social snapshots: exact inactive-day decay, floor, ranking ties, generation filter and statistical-only projection passed.');

for(let last=100;last<=104;last++)for(let asOf=last;asOf<=108;asOf++)for(let day=asOf;day<=112;day++){
 const attempts={100:{score:5000,generation:'g'},101:{score:5000,generation:'g'},[last]:{score:4000,generation:'g'}};
 // Only compare snapshots after the final completed day.
 if(asOf<101)continue;
 const snapshot=api.snapshot({profile:{generation:'g'},dailyAttempts:attempts},asOf).journey;
 assert.equal(api.balance(snapshot,day).km,c.window.BussoleDailyProgress.calculate(attempts,day,'g').km);
}
