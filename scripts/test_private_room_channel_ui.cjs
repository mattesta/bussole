const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[k];
const {chromium}=require('playwright'),esbuild=require('esbuild');
const {initializeApp}=require('firebase-admin/app'),{getDatabase}=require('firebase-admin/database');
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Use Auth/Database emulators.');
const root=path.resolve(__dirname,'..');
(async()=>{
 const entry=`import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';import {getAuth,connectAuthEmulator,signInAnonymously} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';import {getDatabase,connectDatabaseEmulator,ref,get,update} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';import {privateRoomChannel} from './private-room-channel.js?v=1';import {roomIdentity} from './private-room-crypto.js?v=1';
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}),auth=getAuth(app),db=getDatabase(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);await signInAnonymously(auth);let channel;window.lines={};window.statuses=[];window.api={uid:auth.currentUser.uid,async start(meta,room='ABCDEF'){window.lines={};channel=await privateRoomChannel({db,uid:auth.currentUser.uid,room,meta,onLines:lines=>{window.lines=lines;},onStatus:message=>window.statuses.push(message)});return !!channel;},reveal:value=>channel?.reveal(value),stop:()=>channel?.stop(),read:p=>get(ref(db,p)).then(s=>s.val()),write:(p,v)=>update(ref(db,p),v),async decrypt(peer,packet,meta,sender){const identity=await roomIdentity(auth.currentUser.uid,'ABCDEF',meta.createdAt,meta.round);return identity.open(peer,1,sender,auth.currentUser.uid,packet);}};`;
 const build=await esbuild.build({stdin:{contents:entry,resolveDir:root},bundle:true,write:false,format:'esm',nodePaths:[path.dirname(require.resolve('firebase/package.json'))+'/..'],plugins:[{name:'sdk',setup(build){build.onResolve({filter:/^https:\/\/www.gstatic.com\/firebasejs\//},a=>({path:require.resolve('firebase/'+a.path.match(/firebase-(app|auth|database)\.js/)[1])}));build.onResolve({filter:/\.js\?v=/},a=>({path:path.resolve(path.dirname(a.importer)||root,a.path.split('?')[0])}));}}]});
 const app=initializeApp({projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}),db=getDatabase(app);
 const browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM||chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{
  const frames=[],errors=[];
  async function page(){const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('websocket',s=>s.on('framesent',e=>frames.push(String(e.payload))));await p.route('http://localhost/**',r=>r.fulfill({contentType:r.request().url().endsWith('app.js')?'text/javascript':'text/html',body:r.request().url().endsWith('app.js')?build.outputFiles[0].text:'<!doctype html><script type="module" src="/app.js"></script>'}));await p.goto('http://localhost/');await p.waitForFunction(()=>window.api?.uid);return p;}
  const a=await page(),b=await page(),outsider=await page();const auid=await a.evaluate(()=>api.uid),buid=await b.evaluate(()=>api.uid);
  const now=Date.now(),player=name=>({name,colorIndex:0,connected:true,joinedAt:now,ready:true,locked:true,wins:0,eligibleRound:1});
  const players={[auid]:player('A'),[buid]:{...player('B'),colorIndex:1}},meta={schemaVersion:2,visibility:'private',hostId:auid,phase:'revealed',round:1,createdAt:now,expiresAt:now+86300000};
  await db.ref().update({'rooms/ABCDEF':{meta,settings:{mode:'hard',timerEnabled:false,timerDuration:60},players},'roomExpirations/ABCDEF':{createdAt:now,expiresAt:meta.expiresAt}});
  const la={lat:48.123456,lon:11.987654,heading:17,distanceMeters:1234567},lb={lat:-18.54321,lon:130.67891,heading:210,distanceMeters:7654321};
  await a.evaluate(meta=>api.start(meta),meta);
  await a.evaluate(value=>api.reveal(value),{round:1,players,submission:la});
  // A reveals before B registers a public key. Its listener must send B's copy later.
  await b.evaluate(meta=>api.start(meta),meta);await b.evaluate(value=>api.reveal(value),{round:1,players,submission:lb});
  await a.waitForFunction(uid=>window.lines[uid]?.lat===-18.54321,buid);await b.waitForFunction(uid=>window.lines[uid]?.lat===48.123456,auid);
  assert.deepEqual(await a.evaluate(uid=>window.lines[uid],buid),lb);assert.deepEqual(await b.evaluate(uid=>window.lines[uid],auid),la);
  const cloud=(await db.ref('rooms/ABCDEF').get()).val(),encoded=JSON.stringify(cloud);for(const field of ['lat','lon','heading','distanceMeters','angleError','privateKey'])assert.equal(encoded.includes('"'+field+'"'),false,field);
  assert.ok(cloud.lineKeys[1][auid]);assert.ok(cloud.sealedLines[1][auid][buid].data);
  await assert.rejects(outsider.evaluate(()=>api.read('rooms/ABCDEF/sealedLines/1')));
  // Ordinary peers cannot replace another public key, upload plaintext or mutate ciphertext with extra fields.
  await assert.rejects(b.evaluate(({uid})=>api.write('rooms/ABCDEF/lineKeys/1',{[uid]:'A'.repeat(88)}),{uid:auid}));
  await assert.rejects(a.evaluate(({buid})=>api.write('rooms/ABCDEF/sealedLines/1/'+api.uid,{[buid]:{version:1,iv:'A'.repeat(16),data:'A'.repeat(32),lat:48}}),{buid}));
  await b.reload();await b.waitForFunction(()=>window.api?.uid);assert.equal(await b.evaluate(()=>api.uid),buid);await b.evaluate(meta=>api.start(meta),meta);await b.evaluate(value=>api.reveal(value),{round:1,players,submission:lb});await b.waitForFunction(uid=>window.lines[uid]?.lat===48.123456,auid);
  await a.evaluate(()=>api.stop());await b.evaluate(()=>api.stop());
  await a.evaluate(()=>api.write('rooms/ABCDEF',{'meta/phase':'lobby',sealedLines:null,lineKeys:null}));assert.equal((await db.ref('rooms/ABCDEF/sealedLines').get()).exists(),false);assert.equal((await db.ref('rooms/ABCDEF/lineKeys').get()).exists(),false);
  // A lost tab key affects only the old round: fresh round identities recover normal sharing.
  await b.evaluate(()=>sessionStorage.clear());
  const meta2={...meta,round:2};await db.ref('rooms/ABCDEF/meta').update({phase:'revealed',round:2});
  await a.evaluate(meta=>api.start(meta),meta2);await b.evaluate(meta=>api.start(meta),meta2);
  await a.evaluate(value=>api.reveal(value),{round:2,players,submission:la});await b.evaluate(value=>api.reveal(value),{round:2,players,submission:lb});
  await a.waitForFunction(uid=>window.lines[uid]?.lat===-18.54321,buid);await b.waitForFunction(uid=>window.lines[uid]?.lat===48.123456,auid);
  assert.notEqual((await db.ref('rooms/ABCDEF/lineKeys/2/'+buid).get()).val(),cloud.lineKeys[1][buid]);
  await a.evaluate(()=>api.stop());await b.evaluate(()=>api.stop());
  const publicMeta={...meta,visibility:'public'};assert.equal(await outsider.evaluate(meta=>api.start(meta,'PUBLIC'),publicMeta),false);
  for(const frame of frames)for(const field of ['"lat"','"lon"','"heading"','"distanceMeters"','"privateKey"']){
   // One intentionally rejected plaintext attack is tested above; valid exchange frames contain none.
   if(frame.includes('"lat":48'))continue;
   assert.equal(frame.includes(field),false,field);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(await a.evaluate(()=>window.statuses),[]);assert.deepEqual(await b.evaluate(()=>window.statuses),[]);
  console.log('Private room channel: real WebCrypto + SDK + mobile browsers, two-way locations, late key, reload, database-only ciphertext, outsider/plaintext/key-tamper rejection, round purge and public-room exclusion passed.');
 }finally{await browser.close();await app.delete();}
})().catch(e=>{console.error(e);process.exitCode=1});
