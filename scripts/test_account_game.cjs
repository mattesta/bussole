const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({guest=false}={}){
 const handlers={},status={},writes=[];let counter=0,release;
 const c=vm.createContext({URLSearchParams,location:{search:''},document:{getElementById(){return status}},
  beginRound:async()=>guest?null:{id:++counter},
  async saveSample(context,sample){writes.push({id:context.id,sample});if(writes.length===1)await new Promise(resolve=>release=resolve);return true;},
  window:{addEventListener(name,fn){handlers[name]=fn},BussoleReportGeometry:{measure(){return{points:100}}},BussoleAccountStatistics:{sample(){return{points:100}}}}
 });
 vm.runInContext(fs.readFileSync('account-game.js','utf8').replace(/^import[^;]+;\s*/gm,'').replace(/export /g,''),c);
 return{c,writes,status,release:()=>release(),start:()=>handlers['bussole-solo-start'](),record:()=>handlers['bussole-solo-result']({detail:{}})};
}
(async()=>{
 const guest=fixture({guest:true});await guest.record();assert.equal(guest.writes.length,0);
 const game=fixture();const old=game.record();await new Promise(setImmediate);assert.equal(game.writes.length,1);
 game.record();assert.equal(game.writes.length,1); // duplicate Go is ignored while saving.
 game.start();game.release();await old;assert.equal(game.status.textContent,''); // old completion cannot mark the new round as saved.
 await game.record();assert.equal(game.writes.length,2);assert.notEqual(game.writes[0].id,game.writes[1].id);
 await game.record();assert.equal(game.writes.length,2);
 console.log('Account game capture: guests excluded, duplicate Go suppressed, independent round IDs and in-flight reset safety passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
