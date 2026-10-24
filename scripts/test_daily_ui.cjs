const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
for(const key of ['HTTP_PROXY','http_proxy','HTTPS_PROXY','https_proxy'])delete process.env[key];
const {chromium}=require('playwright'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Run with Auth and Database emulators.');
const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getDatabase}=require('firebase-admin/database');
const app=initializeApp({projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}),admin=getAuth(app),db=getDatabase(app);
const fakeMap=`(()=>{
 const handler=()=>({enable(){},disable(){},enableRotation(){},disableRotation(){}});
 class Map{constructor(options){this.options=options;this.camera={center:options.center,zoom:options.zoom};this.canvas=document.createElement('canvas');this.canvas.style='width:100%;height:100%';document.getElementById(options.container).append(this.canvas);this.handlers={};for(const key of ['dragPan','scrollZoom','boxZoom','doubleClickZoom','keyboard','touchZoomRotate'])this[key]=handler();window.__map=this;setTimeout(()=>this.handlers.load?.forEach(fn=>fn()),0)}on(name,fn){(this.handlers[name]||=[]).push(fn);if(name==='click')this.canvas.addEventListener('click',fn);return this}off(){}setProjection(){}addLayer(layer){layer.map=this}triggerRepaint(){}getContainer(){return document.getElementById(this.options.container)}getCanvas(){return this.canvas}project(p){return{x:p[0]*10,y:p[1]*10}}stop(){}jumpTo(camera){this.camera={...camera}}easeTo(camera){this.camera={...camera}}setBearing(bearing){this.camera.bearing=bearing}}
 class Marker{constructor(options){this.element=options.element}setLngLat(p){this.position=p;return this}getLngLat(){return this.position}addTo(map){map.getContainer().append(this.element);return this}remove(){this.element.remove()}}
 class Popup{setLngLat(){return this}setDOMContent(){return this}addTo(){return this}remove(){}}
 window.maplibregl={Map,Marker,Popup};})();`;
(async()=>{
 const build=await esbuild.build({entryPoints:[path.join(root,'account-service.js')],bundle:true,write:false,format:'esm',plugins:[{name:'emulator',setup(build){
  build.onResolve({filter:/^https:\/\/www.gstatic.com\/firebasejs\//},args=>({path:require.resolve('firebase/'+args.path.match(/firebase-(app|auth|database)\.js/)[1])}));
  build.onLoad({filter:/firebase-config\.js$/},()=>({contents:"export const firebaseConfig={apiKey:'demo-key',authDomain:'demo-bussole.firebaseapp.com',projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}",loader:'js'}));
  build.onLoad({filter:/account-service\.js$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('const db=getDatabase(app);',"const db=getDatabase(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);")+"\nimport {connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';import {connectDatabaseEmulator} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';",loader:'js',resolveDir:root}));
 }}]});
 const service=build.outputFiles[0].text,browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:48.1,longitude:11.6}})}}});
   window.DeviceOrientationEvent=class{};
  });
  await page.route('https://unpkg.com/**',route=>route.fulfill({contentType:route.request().url().includes('.css')?'text/css':'text/javascript',body:route.request().url().includes('.css')?'':fakeMap}));
  await page.route('http://localhost/**',route=>{
   const file=new URL(route.request().url()).pathname;
   let body;
   if(file==='/account-service.js')body=service;
   else if(file==='/multiplayer.js'||file==='/globe-multiplayer.js')body=''; // These controllers do not participate in single-player.
   else if(file==='/compass.js')body="window.BussoleCompass={createTracker({onHeading}){window.__aim=onHeading;let tick;return{start(){onHeading(30);tick=setInterval(()=>onHeading(window.__bearing||30),20)},stop(){clearInterval(tick)}}}};";
   else try{body=fs.readFileSync(path.join(root,file==='/'?'index.html':file));}catch{return route.fulfill({status:404,body:'missing'})}
   return route.fulfill({contentType:file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html',body});
  });
  await page.goto('http://localhost/account.html');await page.locator('#showRegister').click();await page.locator('#accountEmail').fill('daily@example.test');await page.locator('#accountPassword').fill('Explorer123!');await page.locator('#authSubmit').click();
  await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('Account created'));
  const uid=await page.evaluate(async()=>(await import('./account-service.js?v=10')).auth.currentUser.uid);await admin.updateUser(uid,{emailVerified:true});await page.locator('#checkVerification').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
  const day=Math.floor(Date.now()/86400000);
  async function openDaily(){await page.goto('http://localhost/');await page.locator('#singlePlayerBtn').click();await page.locator('#soloDailyBtn').click();await page.waitForFunction(()=>!document.getElementById('startSoloBtn').disabled);}
  await openDaily();assert.equal(await page.locator('#soloConfigControls').isVisible(),false);assert.equal(await page.locator('#startSoloBtn').textContent(),'Start official challenge');
  assert.match(await page.locator('#soloDescription').textContent(),/30 s/);assert.match(await page.locator('#dailyTravel .daily-travel-distance').textContent(),/^0 km$/);assert.match(await page.locator('#dailyInfo').textContent(),/leaving or reloading/);
  await page.setViewportSize({width:320,height:740});await page.screenshot({path:'/tmp/bussole-daily-lobby.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:390,height:844});
  await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=daily/);await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);
  assert.match(await page.locator('#dailyGameNotice').textContent(),/Official attempt/);
  const attempt=(await db.ref(`accountData/${uid}/dailyAttempts/${day}`).get()).val();assert.ok(attempt);assert.equal(attempt.score,undefined);
  const targets=[];let total=0;
  for(let round=1;round<=5;round++){
   await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);targets.push(await page.locator('#prototypeTarget').textContent());
   assert.equal(await page.locator('#randomTargetBtn').isVisible(),false);assert.equal(await page.locator('#openGlobeSearchBtn').isVisible(),false);
   await page.locator('#showPrototypeLineBtn').click();await page.locator('#soloGameResults').waitFor({state:'visible'});total+=Number((await page.locator('#soloRoundScore').textContent()).match(/^(\d+)/)[1]);
   if(round<5)await page.locator('#soloNextRoundBtn').click();
  }
  await page.waitForFunction(()=>document.getElementById('soloRecordStatus').textContent.includes('first to finish'));
  assert.equal((await db.ref(`dailyScores/${day}/${attempt.entryKey}`).get()).val(),total);assert.equal((await db.ref(`accountData/${uid}/soloBests`).get()).exists(),false);
  assert.equal(await page.locator('#dailyTravel .daily-travel-distance').textContent(),`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(total/10)} km`);
  assert.match(await page.locator('#dailyTravel .daily-travel-earned').textContent(),/from this challenge/);
  await db.ref().update({[`connections/${uid}/friend`]:{state:'accepted',requestedBy:uid},[`connections/friend/${uid}`]:{state:'accepted',requestedBy:uid},'accountData/friend/profile':{generation:'friend-generation',username:'Friend',useInRooms:false},'publicProfiles/friend':{name:'Friend'},'friendShares/friend':{generation:'friend-generation',journey:{asOfDay:day,tenths:0,lastDay:-1}},[`accountData/friend/dailyAttempts/${day}`]:{generation:'friend-generation',score:0,entryKey:'opaque',startedAt:Date.now()}});
  await page.waitForFunction(()=>document.getElementById('dailyFriends').textContent.includes('Friend — 0 / 5,000'));
  await db.ref(`accountData/friend/dailyAttempts/${day}/score`).set(5000);await page.waitForFunction(()=>document.getElementById('dailyFriends').textContent.includes('Friend — 5000 / 5,000'));
  await db.ref().update({[`connections/${uid}/friend`]:null,[`connections/friend/${uid}`]:null});await page.waitForFunction(()=>!document.getElementById('dailyFriends').textContent.includes('Friend —'));
  // A second completed entry updates the open percentile immediately; ties are not wins.
  await db.ref(`dailyScores/${day}/another-random-key`).set(total);
  await page.waitForFunction(()=>document.getElementById('soloRecordStatus').textContent.includes('#1 of 2 · tied'));
  assert.match(await page.locator('#soloRecordStatus').textContent(),/higher than 0%/);await page.screenshot({path:'/tmp/bussole-daily-results.png'});
  await page.locator('#soloSummaryBtn').click();await page.waitForURL(/match-summary.html/);await page.locator('#statisticsView').click();await page.locator('#statisticsMetrics dt').first().waitFor();assert.equal(await page.locator('.summary-marker').count(),5);await page.locator('#summaryBack').click();await page.waitForURL(/daily=1/);await page.locator('#viewDailyShots').waitFor({state:'visible'});await page.locator('#viewDailyShots').click();await page.waitForURL(/match-summary.html/);assert.equal(await page.locator('.summary-marker').count(),5);await page.locator('#summaryBack').click();await page.waitForURL(/daily=1/);
  await db.ref(`dailyScores/${day}/${attempt.entryKey}`).remove();
  await page.goto('http://localhost/?daily=1');await page.waitForFunction(()=>!document.getElementById('startSoloBtn').disabled);
  assert.equal((await db.ref(`dailyScores/${day}/${attempt.entryKey}`).get()).val(),total);
  assert.equal(await page.locator('#startSoloBtn').textContent(),'Play unranked');assert.match(await page.locator('#dailyInfo').textContent(),new RegExp(`score: ${total}`));
  await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=daily/);await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);assert.match(await page.locator('#dailyGameNotice').textContent(),/Unranked/);
  // Same day gives the same catalogue targets and an unranked replay cannot replace the score.
  for(let round=1;round<=5;round++){
   await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);assert.equal(await page.locator('#prototypeTarget').textContent(),targets[round-1]);await page.locator('#showPrototypeLineBtn').click();if(round<5)await page.locator('#soloNextRoundBtn').click();
  }
  await page.waitForFunction(()=>document.getElementById('soloRecordStatus').textContent.includes('Unranked game'));
  assert.equal((await db.ref(`dailyScores/${day}/${attempt.entryKey}`).get()).val(),total);
  // Historical completed days earn km, missed days use progressive penalties with a zero floor.
  const privatePath=`accountData/${uid}/dailyAttempts`,generation=attempt.generation;
  const historical=[[-4,5000],[-3,5000],[-1,0]];
  for(const [offset,score] of historical){const entryKey=`00000000-0000-0000-0000-${String(day+offset).padStart(12,'0')}`;await db.ref(`${privatePath}/${day+offset}`).set({entryKey,generation,startedAt:(day+offset)*86400000,version:1,score});await db.ref(`dailyScores/${day+offset}/${entryKey}`).set(score);}
  const expectedKm=900+total/10;
  // Export includes only day/status/score; erase also removes the shared contribution.
  await page.goto('http://localhost/account.html');
  await page.locator('#dailyTravel .daily-travel-distance').waitFor();assert.equal(await page.locator('#dailyTravel .daily-travel-distance').textContent(),`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(expectedKm)} km`);
  assert.ok((await page.locator('#dailyAverage').textContent()).includes(new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format((10000+total)/4)));
  assert.match(await page.locator('#dailyAverage').textContent(),/4 completed challenges/);
  const exportedPromise=page.waitForEvent('download');await page.locator('#exportAccount').click();const download=await exportedPromise;const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.deepEqual(data.dailyAttempts.find(row=>row.day===day),{day,status:'completed',score:total});assert.equal(data.dailyJourney.km,expectedKm);assert.equal(data.dailyJourney.missedDays,1);assert.equal(JSON.stringify(data).includes(attempt.entryKey),false);
  await page.locator('#deleteStatistics').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('deleted'));
  assert.equal((await db.ref(`dailyScores/${day}/${attempt.entryKey}`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}/dailyAttempts`).get()).exists(),false);assert.equal(await page.locator('#dailyTravel .daily-travel-distance').textContent(),'0 km');
  for(const [offset] of historical){const entryKey=`00000000-0000-0000-0000-${String(day+offset).padStart(12,'0')}`;assert.equal((await db.ref(`dailyScores/${day+offset}/${entryKey}`).get()).exists(),false);}
  // Reserve then reload: the ticket is consumed, so no second official attempt.
  await openDaily();await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=daily/);await page.waitForFunction(()=>document.getElementById('dailyGameNotice').textContent.includes('Official attempt'));
  const reserved=(await db.ref(`accountData/${uid}/dailyAttempts/${day}`).get()).val();await page.reload();await page.waitForFunction(()=>document.getElementById('dailyGameNotice').textContent.includes('Unranked'));
  assert.equal((await db.ref(`accountData/${uid}/dailyAttempts/${day}`).get()).val().entryKey,reserved.entryKey);
  // Account deletion also removes a completed public contribution after reauthentication.
  await page.evaluate(async data=>(await import('./daily-service.js?v=8')).complete({...data.reserved,uid:data.uid,day:data.day,official:true},0),{reserved,uid,day});
  assert.equal((await db.ref(`dailyScores/${day}/${reserved.entryKey}`).get()).val(),0);
  await page.goto('http://localhost/account.html');await page.locator('#currentPassword').fill('Explorer123!');await page.locator('#deleteAccount').click();await page.locator('#accountAuth').waitFor({state:'visible'});
  assert.equal((await db.ref(`dailyScores/${day}/${reserved.entryKey}`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}`).get()).exists(),false);
  // Guests see the same challenge but do not create an attempt or publish scores.
  await openDaily();assert.equal(await page.locator('#startSoloBtn').textContent(),'Play unranked');await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=daily/);await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);assert.equal(await page.locator('#prototypeTarget').textContent(),targets[0]);assert.match(await page.locator('#dailyGameNotice').textContent(),/Unranked/);
  assert.deepEqual(errors,[]);console.log('Native daily journey + real SDK/emulators: rewards, historical penalties, Home/results/account balance, export/erasure; official five-round challenge, live percentile/ties, same-target replay and guest exclusion, one-use reload, Summary, export and atomic private/shared erasure passed.');
 }finally{await browser.close();await app.delete();}
})().catch(error=>{console.error(error);process.exitCode=1});
