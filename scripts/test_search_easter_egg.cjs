const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{},fetch(){throw Error('Easter egg must not call the geocoder')}});
vm.runInContext(fs.readFileSync('round-target.js','utf8'),c);
const helper=c.window.BussoleRoundTargets;
assert.equal(helper.searchEasterEgg('Paris'),null);
for(const query of ['Fanculo','  FANCULO  ','vai a fanculo']){
 const result=helper.searchEasterEgg(query);
 assert.equal(result.label,'Fanculo');assert.ok(result.lat>=-90&&result.lat<=90);assert.ok(result.lon>=-180&&result.lon<=180);
}
const points=Array.from({length:10},()=>JSON.stringify(helper.searchEasterEgg('fanculo')));
assert.ok(new Set(points).size>1);
// Exercise the actual single-player lookup used by Search and suggestions.
const globe=fs.readFileSync('globe-prototype.js','utf8');
const lookup=globe.slice(globe.indexOf('async function fetchSearchResults('),globe.indexOf('async function searchTarget()'));
vm.runInContext(lookup,c);
(async()=>{
 const results=await c.fetchSearchResults('Fanculo');assert.equal(results.length,1);assert.equal(results[0].display_name,'Fanculo');
 let saved;
 c.byId=()=>({value:'FANCULO'});c.roomMessage={};c.saveTarget=async target=>{saved=target};
 const lobby=fs.readFileSync('multiplayer.js','utf8');
 vm.runInContext(lobby.slice(lobby.indexOf('async function searchTarget()'),lobby.indexOf('async function saveTarget(')),c);
 await c.searchTarget();assert.equal(saved.label,'Fanculo');assert.ok(Number.isFinite(saved.lat)&&Number.isFinite(saved.lon));
 assert.match(c.roomMessage.textContent,/Ready/);
 console.log('Search Easter egg: case-insensitive matching, fresh world coordinates, solo suggestions/Search and shared lobby target without geocoding passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
