const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
for(const key of ['HTTP_PROXY','http_proxy','HTTPS_PROXY','https_proxy'])delete process.env[key];
const root=path.resolve(__dirname,'..');
const esbuild=require('esbuild');
const {chromium}=require('playwright');
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw new Error('Run this test with the Auth and Database emulators.');

const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getDatabase}=require('firebase-admin/database');
const app=initializeApp({projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}),admin=getAuth(app),db=getDatabase(app);
(async()=>{
const build=await esbuild.build({entryPoints:[path.join(root,'account.js')],bundle:true,write:false,format:'esm',plugins:[{name:'emulator',setup(build){
 build.onResolve({filter:/^https:\/\/www.gstatic.com\/firebasejs\//},args=>({path:require.resolve('firebase/'+args.path.match(/firebase-(app|auth|database)\.js/)[1])}));
 build.onResolve({filter:/\.js\?v=/},args=>({path:path.resolve(path.dirname(args.importer),args.path.split('?')[0])}));
 build.onLoad({filter:/firebase-config\.js$/},()=>({contents:"export const firebaseConfig={apiKey:'demo-key',authDomain:'demo-bussole.firebaseapp.com',projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}",loader:'js'}));
 build.onLoad({filter:/account-service\.js$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("const db=getDatabase(app);","const db=getDatabase(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);")+"\nimport { connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';import { connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';",loader:'js',resolveDir:root}));
 build.onLoad({filter:/\/account\.js$/},args=>({contents:fs.readFileSync(args.path,'utf8')+"\nimport * as testing from './account-service.js?v=9';window.__accounts=testing;",loader:'js',resolveDir:root}));
}}]});
const js=build.outputFiles[0].text;
const browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const serve=async route=>{const file=new URL(route.request().url()).pathname;try{await route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/javascript',body:file==='/account.js'?js:fs.readFileSync(path.join(root,file))});}catch{await route.fulfill({status:404,body:'missing'})}};await page.route('http://localhost/**',serve);const frames=[];page.on('websocket',socket=>socket.on('framesent',event=>frames.push(String(event.payload))));const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('console',message=>{if(message.type()==='error')console.log('BROWSER',message.text())});page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://localhost/account.html');await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.locator('#accountEmail').fill('matteo@example.test');await page.locator('#accountPassword').fill('Explorer123!');await page.locator('#authSubmit').click();
 await page.locator('#accountDetails').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('Account created'));
 assert.equal(await page.locator('#communityConsent').count(),0);assert.equal(await page.evaluate(()=>window.__accounts.beginRound()),null);
 const uid=await page.evaluate(()=>window.__accounts.auth.currentUser.uid);await admin.updateUser(uid,{emailVerified:true});await page.locator('#checkVerification').click();
 await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
 await page.locator('#accountUsername').fill('Marco_Polo');await page.locator('#useUsernameInRooms').check();await page.getByRole('button',{name:'Save preferences'}).click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Preferences saved.');
 assert.equal(await page.evaluate(()=>window.__accounts.roomName()),'Marco_Polo');
 await page.route('http://localhost/match-summary.html?embedded=1',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>Private replay</body><script>addEventListener("message",e=>{if(e.origin===location.origin)window.received=e.data.report})</script>'}));
 const saved=await page.evaluate(async()=>{const a=window.__accounts,c=await a.beginRound();window.__oldRound=c;const sample={day:Math.floor(Date.now()/86400000),mode:'hard',kind:'solo',points:800,relativeError:10,angleError:-20,distanceError:-30};const detail={submission:{lat:48,lon:11,heading:120,distanceMeters:500000},target:{lat:46,lon:12,label:'Venice'}};await a.saveSample(c,sample,'private-room:test:1',detail);return a.saveSample(c,sample,'private-room:test:1',detail)});assert.equal(saved,true);
 const cloud=(await db.ref(`accountData/${uid}/proShots`).get()).val();
 assert.doesNotMatch(JSON.stringify(cloud),/"(lat|lon|heading|distanceMeters|submission|target|angleError|distanceError|relativeError|day|kind|mode)":/);
 assert.equal(Object.values(cloud)[0].destination,'Venice');
 assert.equal((await db.ref(`accountData/${uid}/samples`).get()).exists(),false);
 const record=await page.evaluate(async()=>{const a=window.__accounts,owner=await a.beginRound();const config={mode:'hard',timerSeconds:0,blurEnabled:false};await a.saveSoloBest(owner,config,3500);return a.saveSoloBest(owner,config,3000)});
 assert.equal(record.best,3500);assert.equal(record.isNew,false);
 await page.reload();await page.waitForFunction(()=>document.getElementById('personalStatsCount').textContent.startsWith('1 completed'));
 assert.match(await page.locator('#soloBestList').textContent(),/3500/);assert.equal(await page.locator('.chart-guess-ray').count(),1);assert.equal(await page.locator('.chart-guess-tick').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#personalStatistics').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/bussole-account-stats.png'});
 await page.locator('#modeFilters [data-mode=easy]').click();assert.match(await page.locator('#personalStatsCount').textContent(),/0 completed/);await page.locator('#modeFilters [data-mode=all]').click();
 assert.equal(await page.locator('#proBestShotList li').count(),1);assert.match(await page.locator('#proBestShotList').textContent(),/800/);
 await page.locator('#proBestShotList button').click();await page.locator('#privateShotDialog').waitFor({state:'visible'});const globe=page.frameLocator('#privateShotFrame');await globe.locator('body').waitFor();await page.waitForFunction(()=>document.getElementById('privateShotFrame').contentWindow.received?.rounds?.[0]?.target?.label==='Venice');
 assert.equal(await page.locator('#privateShotFrame').evaluate(el=>el.contentWindow.received.rounds[0].entries[0].submission.lat),48);assert.doesNotMatch(await page.locator('#privateShotFrame').getAttribute('src'),/48|Venice/);await page.locator('#closePrivateShot').click();assert.equal(await page.locator('#privateShotFrame').getAttribute('src'),'about:blank');
 // Clearing local geometry removes replay; the cloud keeps score/destination only.
 const localState=await page.evaluate(()=>{const key='bussole-private-geometry-v1:'+window.__accounts.auth.currentUser.uid;const value=localStorage.getItem(key);localStorage.removeItem(key);return {key,value}});
 await page.reload();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
 assert.equal(await page.locator('#proBestShotList button').count(),0);
 // A legacy record is copied into this owner's browser, then stripped from Firebase.
 const legacyProfile=(await db.ref(`accountData/${uid}/profile`).get()).val();await db.ref(`accountData/${uid}/profile`).set({...legacyProfile,communityConsent:true,consentVersion:1});
 const sampleId=Object.values(cloud)[0].sampleId;const legacySample={day:Math.floor(Date.now()/86400000),mode:'hard',kind:'solo',points:800,relativeError:10,angleError:-20,distanceError:-30,generation:legacyProfile.generation};
 await db.ref(`accountData/${uid}/samples/${sampleId}`).set(legacySample);
 const legacyShare=(await db.ref(`friendShares/${uid}`).get()).val();await db.ref(`friendShares/${uid}`).set({...legacyShare,samples:[legacySample]});
 const legacyShot={...Object.values(cloud)[0],day:Math.floor(Date.now()/86400000),mode:'hard',kind:'solo',relativeError:10,angleError:-20,distanceError:-30,submission:{lat:48,lon:11,heading:120,distanceMeters:500000},target:{lat:46,lon:12,label:'Venice'}};delete legacyShot.destination;
 await db.ref(`accountData/${uid}/proShots/0`).set(legacyShot);
 await page.reload();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
 assert.equal(await page.locator('#proBestShotList button').count(),1);
 assert.doesNotMatch(JSON.stringify((await db.ref(`accountData/${uid}/proShots`).get()).val()),/"(lat|lon|submission|target|angleError|distanceError|relativeError)":/);
 assert.equal((await db.ref(`accountData/${uid}/samples`).get()).exists(),false);assert.equal((await db.ref(`friendShares/${uid}/samples`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}/profile/communityConsent`).get()).exists(),false);
 assert.equal(await page.locator('#communityMetrics').count(),0);
 const download=page.waitForEvent('download');await page.locator('#exportAccount').click();const exported=await download;const exportedPath=await exported.path();const contents=JSON.parse(fs.readFileSync(exportedPath,'utf8'));assert.equal(contents.samples.length,1);assert.equal(contents.soloBests[0].score,3500);assert.equal(contents.soloBests[0].generation,undefined);assert.equal(contents.samples[0].angleError,-20);assert.equal(contents.profile.generation,undefined);assert.equal(contents.privateProShots.length,1);assert.equal(contents.privateProShots[0].target.label,'Venice');assert.doesNotMatch(JSON.stringify(contents.samples),/"(lat|lon|target|roomCode|heading)":/);
 // A separate browser has cloud records but cannot download detailed statistics.
 const secondContext=await browser.newContext({viewport:{width:390,height:844}}),second=await secondContext.newPage();await second.route('http://localhost/**',serve);
 await second.goto('http://localhost/account.html');await second.locator('#accountEmail').fill('matteo@example.test');await second.locator('#accountPassword').fill('Explorer123!');await second.locator('#authSubmit').click();await second.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
 assert.match(await second.locator('#personalStatsCount').textContent(),/0 completed/);assert.match(await second.locator('#proBestShotList').textContent(),/800/);assert.equal(await second.locator('#proBestShotList button').count(),0);
 await second.evaluate(async()=>{const a=window.__accounts,c=await a.beginRound();await a.saveSample(c,{day:Math.floor(Date.now()/86400000),mode:'medium',kind:'solo',points:700,angleError:11,relativeError:25});});await second.reload();await second.waitForFunction(()=>document.getElementById('personalStatsCount').textContent.startsWith('1 completed'));
 assert.equal((await db.ref(`accountData/${uid}/samples`).get()).exists(),false);
 // Block only our device database, preserving Firebase Auth's own storage.
 const deniedContext=await browser.newContext(),denied=await deniedContext.newPage();await denied.route('http://localhost/**',serve);await denied.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,version)=>{if(name==='bussole-device-statistics-v1')throw Error('blocked');return open(name,version)}});
 await denied.goto('http://localhost/account.html');await denied.locator('#accountEmail').fill('matteo@example.test');await denied.locator('#accountPassword').fill('Explorer123!');await denied.locator('#authSubmit').click();await denied.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('Device storage is unavailable'));
 const blocked=await denied.evaluate(async()=>{const a=window.__accounts,c=await a.beginRound();try{await a.saveSample(c,{day:20000,mode:'medium',kind:'solo',points:700,angleError:22,relativeError:33});return false}catch{return true}});assert.equal(blocked,true);assert.equal((await db.ref(`accountData/${uid}/samples`).get()).exists(),false);await deniedContext.close();
 assert.doesNotMatch(frames.join(''),/"(angleError|distanceError|relativeError)":/);
 await page.evaluate(async()=>{window.__stale=await window.__accounts.beginRound()});
 await page.locator('#deleteStatistics').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.startsWith('Your statistics have been deleted'));
 assert.equal((await db.ref(`accountData/${uid}/proShots`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}/samples`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}/soloBests`).get()).exists(),false);assert.equal((await db.ref(`accountData/${uid}/profile/communityConsent`).get()).exists(),false);
 await second.reload();await second.waitForFunction(()=>document.getElementById('personalStatsCount').textContent.startsWith('0 completed'));await secondContext.close();
 const stale=await page.evaluate(async()=>{try{await window.__accounts.saveSample(window.__stale,{day:20000,mode:'hard',kind:'solo',points:0});return false}catch{return true}});assert.equal(stale,true);
 await page.locator('#currentPassword').fill('Explorer123!');await page.locator('#newPassword').fill('Explorer456!');await page.locator('#changePassword').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Password changed.');
 await page.locator('#currentPassword').fill('Explorer456!');await page.locator('#newEmail').fill('new-email@example.test');await page.locator('#changeEmail').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.startsWith('Open the verification link'));assert.equal((await admin.getUser(uid)).email,'matteo@example.test');await page.locator('#signOut').click();await page.locator('#accountAuth').waitFor({state:'visible'});await page.locator('#accountEmail').fill('matteo@example.test');await page.locator('#resetPassword').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.startsWith('If an account'));await page.locator('#accountPassword').fill('Explorer456!');await page.locator('#authSubmit').click();await page.locator('#accountDetails').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('accountStatus').textContent==='Your account is ready.');
 await page.locator('#currentPassword').fill('Explorer456!');await page.locator('#deleteAccount').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.startsWith('Your account and personal statistics have been deleted'));
 assert.equal((await db.ref(`accountData/${uid}`).get()).exists(),false);await assert.rejects(admin.getUser(uid),{code:'auth/user-not-found'});
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.screenshot({path:'/tmp/bussole-account-register.png'});
 assert.deepEqual(errors,[]);console.log('Real SDK + Auth/Database emulator mobile UI: registration, verification gate, username preference, device-only errors, migration, separate browsers, blocked storage, charts/filters, export, stale-round rejection, password change, sign-out/sign-in and full deletion passed.');
 await page.setViewportSize({width:320,height:700});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await context.close();
}finally{await browser.close();await app.delete();}
})().catch(e=>{console.error(e);process.exitCode=1});
