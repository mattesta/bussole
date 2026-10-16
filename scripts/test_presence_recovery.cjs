const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function extract(source,name){const start=source.indexOf(`async function ${name}(`);let end=source.indexOf('{',start),depth=1;for(end++;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
function fixture(file,{pendingArm=false,fail=false,lateDisconnect=false}={}){
 let arms=0,writes=0,cancels=0,release;
 const gate=pendingArm?new Promise(r=>release=r):Promise.resolve();
 const context=vm.createContext({console:{warn(){}},document:{visibilityState:'visible'},
  user:{uid:'me'},roomMeta:{phase:'lobby'},roomCode:'ABCDEF',leaving:false,presenceReady:true,databaseConnected:true,
  presenceRefreshPromise:null,presenceRefreshQueued:false,disconnectHandle:{async cancel(){cancels++;throw Error('Must not wait on cancellation')}},
  players:{me:{connected:false,lastSeenAt:123}},db:{},ref(db,path){return path},roomPath:p=>'rooms/ABCDEF/'+p,
  serverTimestamp:()=>123,window:{BussoleGlobe:{setStatus(){}}},
  onDisconnect(){return{async update(value){arms++;assert.equal(value.connected,false);await gate;if(fail)throw Error('offline')}}},
  async update(path,value){writes++;assert.equal(path,'rooms/ABCDEF/players/me');assert.equal(value.connected,true);
    if(lateDisconnect&&writes===1){context.players.me.connected=false;context.refreshPresence();}
    else context.players.me.connected=true;
  }
 });
 vm.runInContext(extract(fs.readFileSync(file,'utf8'),'refreshPresence'),context);
 return{c:context,release:()=>release(),counts:()=>({arms,writes,cancels})};
}
(async()=>{
 for(const file of ['multiplayer.js','globe-multiplayer.js']){
  const f=fixture(file,{pendingArm:true});const one=f.c.refreshPresence(),two=f.c.refreshPresence();
  assert.equal(f.counts().arms,1);f.release();await Promise.all([one,two]);assert.deepEqual(f.counts(),{arms:1,writes:1,cancels:0});
  const leaving=fixture(file,{pendingArm:true});const task=leaving.c.refreshPresence();leaving.c.leaving=true;leaving.release();await task;assert.equal(leaving.counts().writes,0);
  const late=fixture(file,{lateDisconnect:true});await late.c.refreshPresence();await new Promise(setImmediate);assert.equal(late.counts().writes,2);assert.equal(late.c.players.me.connected,true);
  const closed=fixture(file);closed.c.roomMeta.phase='closed';await closed.c.refreshPresence();assert.equal(closed.counts().arms,0);
  const failed=fixture(file,{fail:true});await failed.c.refreshPresence();assert.equal(failed.counts().writes,0);assert.equal(failed.c.presenceRefreshPromise,null);
  if(file.startsWith('globe')){const unready=fixture(file);unready.c.presenceReady=false;await unready.c.refreshPresence();assert.equal(unready.counts().arms,0);}
 }
 console.log('Presence recovery: deduplicated reconnects, no cancellation stall, late previous-page disconnect repair, leave guards, failed network and pre-initialization safety passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
