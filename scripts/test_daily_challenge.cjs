const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const c=vm.createContext({window:{}});for(const file of ['solo-game.js','daily-challenge.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
const api=c.window.BussoleDaily,catalogue=JSON.parse(fs.readFileSync('daily-targets-v1.json'));
function deck(day){const game=api.create(catalogue,day),targets=[];for(let i=0;i<5;i++){targets.push(game.target);assert.equal(game.next(),false);game.finish(null,0);if(i<4)game.next();}return JSON.stringify(targets);}
assert.equal(deck(20746),deck(20746));assert.notEqual(deck(20746),deck(20747));assert.equal(new Set(JSON.parse(deck(20746)).map(t=>t.label)).size,5);
assert.equal(api.day(Date.parse('2026-10-20T23:59:59Z')),20746);assert.equal(api.day(Date.parse('2026-10-21T00:00:00Z')),20747);assert.equal(api.date(20746),'2026-10-20');
assert.equal(api.SETTINGS.mode,'medium');assert.equal(api.SETTINGS.timerSeconds,30);assert.equal(api.SETTINGS.blurEnabled,true);
assert.equal(api.comparison({own:3000,a:1000,b:3000,c:4000},3000,'own').percent,33.3);assert.equal(api.comparison({own:0},0,'own').percent,null);assert.equal(api.comparison({a:0,b:0},0).percent,0);assert.equal(api.comparison({a:0,b:100},5000).percent,100);
assert.equal(api.comparison(Object.fromEntries(Array.from({length:2000},(_,i)=>[i,i===0?5000:0])),4000).percent,99.9);
assert.equal(api.comparison({a:'5000',b:-1,c:5001,d:1.5},0).opponents,0);
assert.match(api.describe(api.comparison({own:20},20,'own')),/first/);
assert.match(api.describe(api.comparison({a:0},1000),0),/1970-01-01/);
// Frozen v1 deck prevents accidental catalogue/algorithm drift between deployments.
assert.equal(crypto.createHash('sha256').update(deck(20746)).digest('hex'),'89f2198488af2bc0e1139ac1d19216d989eb4deea748aea54dbb555b98b63458');
console.log('Daily challenge: stable common targets, distinct rounds, UTC midnight, fixed settings, exact ties/self-exclusion and empty-pool behavior passed.');
