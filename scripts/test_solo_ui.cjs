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
  await page.goto('http://localhost/account.html');await page.locator('#showRegister').click();await page.locator('#accountEmail').fill('solo@example.test');await page.locator('#accountPassword').fill('Explorer123!');await page.locator('#authSubmit').click();
  await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('Account created'));
  const uid=await page.evaluate(async()=>(await import('./account-service.js?v=5')).auth.currentUser.uid);await admin.updateUser(uid,{emailVerified:true});await page.locator('#checkVerification').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
  await page.goto('http://localhost/');await page.locator('#singlePlayerBtn').click();assert.equal(await page.locator('#soloGameBtn').isVisible(),true);assert.equal(await page.locator('#soloPracticeBtn').isVisible(),true);
  await page.locator('#soloGameBtn').click();assert.equal(await page.locator('#soloMode').inputValue(),'medium');
  await page.locator('#timerCheckbox').check();await page.locator('#timerDuration').fill('2');assert.equal(await page.locator('#startSoloBtn').isDisabled(),true);await page.locator('#timerCheckbox').uncheck();
  await page.screenshot({path:'/tmp/bussole-solo-lobby.png'});await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=game/);await page.locator('#showPrototypeLineBtn').waitFor();
  const targets=[];let total=0;
  for(let round=1;round<=5;round++){
   await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);assert.match(await page.locator('#soloRoundLabel').textContent(),new RegExp(`Round ${round} / 5`));
   targets.push(await page.locator('#prototypeTarget').textContent());assert.equal(await page.locator('#randomTargetBtn').isVisible(),false);assert.equal(await page.locator('#resetPrototypeBtn').isVisible(),false);
   const locked=await page.locator('#prototypeTarget').textContent();await page.locator('#randomTargetBtn').evaluate(el=>el.click());assert.equal(await page.locator('#prototypeTarget').textContent(),locked);
   await page.locator('#showPrototypeLineBtn').click();await page.locator('#soloGameResults').waitFor({state:'visible'});
   const text=await page.locator('#soloRoundScore').textContent();total+=Number(text.match(/^(\d+)/)[1]);assert.ok(text.includes(`Total: ${total} / 5000`));
   if(round<5){assert.equal((await db.ref(`accountData/${uid}/soloBests`).get()).exists(),false);await page.locator('#soloNextRoundBtn').click();await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);const center=await page.evaluate(()=>window.__map.camera.center);assert.ok(Math.abs(center[0]-11.6)<1e-8&&Math.abs(center[1]-48.1)<1e-8);}
  }
  assert.equal(new Set(targets).size,5);await page.waitForFunction(()=>document.getElementById('soloRecordStatus').textContent.includes('personal best'));
  assert.equal((await db.ref(`accountData/${uid}/soloBests/medium-t0-b0/score`).get()).val(),total);
  await page.screenshot({path:'/tmp/bussole-solo-results.png'});await page.locator('#soloSummaryBtn').click();const summary=page.frameLocator('#matchSummaryFrame');await summary.locator('#statisticsView').waitFor();await summary.locator('#statisticsView').click();await summary.locator('#statisticsMetrics dt').first().waitFor();assert.match(await summary.locator('#statisticsCount').textContent(),/5 of 5/);await summary.locator('#summaryBack').click();await page.locator('#soloGameResults').waitFor({state:'visible'});
  await page.locator('#prototypeBackLink').click();await page.locator('#singlePlayerBtn').click();await page.locator('#soloPracticeBtn').click();await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=practice/);await page.locator('#randomTargetBtn').click();await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);await page.locator('#showPrototypeLineBtn').click();const resultCenter=await page.evaluate(()=>window.__map.camera.center);
  await page.locator('#randomTargetBtn').click();await page.waitForTimeout(100);const center=await page.evaluate(()=>window.__map.camera.center);assert.ok(Math.abs(center[0]-11.6)<1e-8&&Math.abs(center[1]-48.1)<1e-8);assert.notDeepEqual(center,resultCenter);assert.equal(await page.locator('#openGlobeSearchBtn').isVisible(),true);assert.equal(await page.locator('#soloNextRoundBtn').isVisible(),false);
  // A guest timed Pro game: timeout is DNF, distances clear, and no record is imported.
  await page.goto('http://localhost/account.html');await page.locator('#signOut').click();await page.waitForFunction(()=>!document.getElementById('accountAuth').classList.contains('hidden'));await page.goto('http://localhost/');await page.locator('#singlePlayerBtn').click();await page.locator('#soloGameBtn').click();await page.locator('[data-choice-value=hard]').first().click();await page.locator('#timerCheckbox').check();await page.locator('#timerDuration').fill('3');await page.locator('#startSoloBtn').click();
  await page.waitForFunction(()=>document.getElementById('soloRoundScore').textContent.includes('DNF'),{},{timeout:15000});assert.equal(await page.locator('#distanceInputWrap').isVisible(),false);await page.locator('#soloNextRoundBtn').click();assert.equal(await page.locator('#distanceInput').inputValue(),'');
  for(let round=2;round<=5;round++){
   await page.locator('#distanceInput').fill('1000');await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);await page.locator('#showPrototypeLineBtn').click();if(round<5)await page.locator('#soloNextRoundBtn').click();
  }
  console.log('Guest completion',await page.locator('#soloRecordStatus').textContent(),await page.locator('#soloRoundLabel').textContent(),errors);
  await page.waitForFunction(()=>document.getElementById('soloRecordStatus').textContent.includes('Sign in'));assert.equal((await db.ref(`accountData/${uid}/soloBests/hard-t3-b0`).get()).exists(),false);
  assert.deepEqual(errors,[]);console.log('Native solo flow + real Firebase emulators passed: Game/Practice lobby, validation, five non-skippable targets, running total, verified private record, summary, Practice camera reset under live compass, timed Pro DNF and cleared distances, guest exclusion.');
 }finally{await browser.close();await app.delete();}
})().catch(error=>{console.error(error);process.exitCode=1});
