for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[key];
const fs=require('fs'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,remove,runTransaction}=require('firebase/database');
async function helper(){const result=await require('esbuild').build({entryPoints:['room-cleanup.js'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'sdk',setup(build){build.onResolve({filter:/^https:/},()=>({path:require.resolve('firebase/database'),external:true}))}}]});const Module=require('node:module'),m=new Module(__filename);m.paths=module.paths;m._compile(result.outputFiles[0].text,__filename);return m.exports.deleteEmptyRoom;}
const now=Date.now();
const player=(name)=>({name,colorIndex:0,connected:true,joinedAt:now,ready:false,locked:false,wins:0,eligibleRound:1});
const makeRoom=()=>({meta:{schemaVersion:2,hostId:'host',visibility:'private',phase:'lobby',round:0,createdAt:now,expiresAt:now+86400000-60000},settings:{mode:'hard',timerEnabled:false,timerDuration:60},players:{host:player('Host')}});
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});
try{
 const db=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'}}).database(),a=db('host'),b=db('friend'),c=db('stranger'),cleaner=db('cleaner');
 const admin=fn=>env.withSecurityRulesDisabled(ctx=>fn(ctx.database()));
 await admin(d=>set(ref(d,'roomMaintenanceConfig'),{uid:'cleaner'}));
 async function create(code,room){return update(ref(a),{[`rooms/${code}`]:room,[`roomExpirations/${code}`]:{createdAt:room.meta.createdAt,expiresAt:room.meta.expiresAt}})}
 const deleteEmptyRoom=await helper();
 const room=makeRoom();await ok(create('ABCDEF',room));
 await no(get(ref(c,'rooms/ABCDEF')));await no(get(ref(a,'rooms/ABCDEF')));await no(get(ref(c,'roomExpirations')));
 await no(get(ref(cleaner,'rooms/ABCDEF')));await ok(get(ref(cleaner,'roomExpirations')));await no(get(ref(cleaner,'accountData/host')));
 await no(remove(ref(cleaner,'rooms/ABCDEF')));await no(update(ref(a,'rooms/ABCDEF/meta'),{expiresAt:now+999999999}));
 const raw={lat:48,lon:11,heading:180,distanceMeters:123456};
 await ok(set(ref(b,'rooms/ABCDEF/players/friend'),player('Friend')));
 await ok(update(ref(a,'rooms/ABCDEF/meta'),{phase:'aiming',round:1}));
 const publicKey='B'.repeat(87)+'=',packet={version:1,iv:'A'.repeat(16),data:'A'.repeat(32)};
 await ok(set(ref(a,'rooms/ABCDEF/lineKeys/1/host'),publicKey));await ok(set(ref(b,'rooms/ABCDEF/lineKeys/1/friend'),publicKey));
 await no(set(ref(b,'rooms/ABCDEF/lineKeys/1/host'),'C'.repeat(87)+'='));
 await no(set(ref(a,'rooms/ABCDEF/lineKeys/1/host'),'C'.repeat(87)+'='));
 await no(get(ref(c,'rooms/ABCDEF/lineKeys/1')));
 await ok(update(ref(a,'rooms/ABCDEF/meta'),{phase:'aiming',round:1}));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/friend'),packet));
 for(const d of [a,b])await no(set(ref(d,`rooms/ABCDEF/submissions/1/${d===a?'host':'friend'}`),raw));
 for(const extra of [{submission:raw},{route:[[1,2],[3,4]]},{lat:48},{heading:90},{errorArc:[[1,2],[3,4]]}])await no(set(ref(a,'rooms/ABCDEF/publicResults/1/host'),{version:1,points:900,...extra}));
 await ok(set(ref(a,'rooms/ABCDEF/publicResults/1/host'),{version:1,points:900}));
 await ok(set(ref(b,'rooms/ABCDEF/publicResults/1/friend'),{version:1,points:700}));
 await no(get(ref(b,'rooms/ABCDEF/publicResults/1')));await no(set(ref(a,'rooms/ABCDEF/publicResults/0/host'),{version:1,points:1000}));
 await ok(update(ref(a,'rooms/ABCDEF/meta'),{phase:'revealed'}));assert.equal((await ok(get(ref(b,'rooms/ABCDEF/publicResults/1')))).val().host.points,900);
 await no(get(ref(c,'rooms/ABCDEF/publicResults/1')));
 await ok(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/friend'),packet));await ok(get(ref(b,'rooms/ABCDEF/sealedLines/1')));
 await no(get(ref(c,'rooms/ABCDEF/sealedLines/1')));
 await no(set(ref(b,'rooms/ABCDEF/sealedLines/1/host/friend'),packet));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/0/host/friend'),packet));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/stranger'),packet));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/friend'),{...packet,submission:raw}));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/friend'),{...packet,data:'not ciphertext!'}));
 await admin(d=>set(ref(d,'rooms/ABCDEF/meta/visibility'),'public'));
 await no(get(ref(b,'rooms/ABCDEF/lineKeys/1')));await no(get(ref(b,'rooms/ABCDEF/sealedLines/1')));
 await no(set(ref(a,'rooms/ABCDEF/sealedLines/1/host/friend'),packet));
 await admin(d=>set(ref(d,'rooms/ABCDEF/meta/visibility'),'private'));
 await ok(remove(ref(a,'rooms/ABCDEF/sealedLines')));
 for(const field of ['meta/position','settings/position','players/host/position','secret'])await no(set(ref(a,`rooms/ABCDEF/${field}`),raw));
 await no(update(ref(a,'rooms/ABCDEF/meta'),{roundHistory:{1:{round:1,matchStartRound:0,mode:'hard',target:{lat:20,lon:30,label:'Target'},players:{host:{name:'Host',colorIndex:0}},submission:raw}}}));
 await ok(update(ref(a,'rooms/ABCDEF/meta'),{roundHistory:{1:{round:1,matchStartRound:0,mode:'hard',target:{lat:20,lon:30,label:'Target'},players:{host:{name:'Host',colorIndex:0}}}}}));
 await ok(update(ref(a,'rooms/ABCDEF'),{'meta/phase':'lobby','meta/roundHistory':null,publicResults:null}));
 // The last player deletes the actual room, rather than a closed marker.
 await ok(update(ref(a,'rooms/ABCDEF/players/host'),{connected:false,lastSeenAt:0}));
 assert.equal(await deleteEmptyRoom(a,'ABCDEF','host',now,Date.now()),false);
 await ok(update(ref(b,'rooms/ABCDEF/players/friend'),{connected:false,lastSeenAt:0}));
 // A recently disconnected rival keeps its navigation grace period.
 await ok(update(ref(a,'rooms/ABCDEF/players/host'),{lastSeenAt:Date.now()}));
 assert.equal(await deleteEmptyRoom(b,'ABCDEF','friend',now,Date.now()),false);
 await ok(update(ref(a,'rooms/ABCDEF/players/host'),{lastSeenAt:0}));
 assert.equal(await deleteEmptyRoom(b,'ABCDEF','friend',now+1,Date.now()),false);
 assert.equal(await deleteEmptyRoom(b,'ABCDEF','friend',now,Date.now()),true);
 await ok(remove(ref(b,'roomExpirations/ABCDEF')));
 await admin(async d=>assert.equal((await get(ref(d,'rooms/ABCDEF'))).exists(),false));
 // Expiry is enforced by server rules even when the UI is stale.
 const expired=makeRoom();expired.meta.createdAt=now-2*86400000;expired.meta.expiresAt=now-86400000;
 await admin(d=>update(ref(d),{'rooms/EXPIRE':expired,'roomExpirations/EXPIRE':{createdAt:expired.meta.createdAt,expiresAt:expired.meta.expiresAt}}));
 await no(set(ref(a,'rooms/EXPIRE/publicResults/1/host'),{version:1,points:3}));await no(get(ref(a,'rooms/EXPIRE')));
 await ok(remove(ref(cleaner,'rooms/EXPIRE')));await ok(remove(ref(cleaner,'roomExpirations/EXPIRE')));
 await no(set(ref(cleaner,'rooms/NEWONE'),room));await no(set(ref(c,'roomMaintenanceConfig'),{uid:'stranger'}));
 // Root-level creation cannot smuggle raw geometry around nested rules.
 for(const field of ['submissions','secret']){const bad=makeRoom();bad[field]={1:{host:raw}};await no(create('BADBAD',bad));}
 const legacy=makeRoom();delete legacy.meta.schemaVersion;await no(create('OLDOLD',legacy));
 console.log('Room privacy: atomic schema/index creation, no raw uploads, private-only immutable public keys/ciphertext, reveal-time and sender/recipient binding, strict payloads, member-only scores, reset, last-player deletion, expiry and deletion-only maintenance identity passed.');
}finally{await env.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1});
