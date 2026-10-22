const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),{chromium}=require('playwright'),webpush=require('../notification-sender/node_modules/web-push');
for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[k];
const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getDatabase}=require('firebase-admin/database'),root=path.resolve(__dirname,'..');
(async()=>{
 const adminApp=initializeApp({projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'},'reminder-ui'),admin=getAuth(adminApp),db=getDatabase(adminApp),keys=webpush.generateVAPIDKeys();
 const build=await esbuild.build({entryPoints:[path.join(root,'account.js')],bundle:true,write:false,format:'esm',plugins:[{name:'emulator',setup(build){
 build.onResolve({filter:/^https:\/\/www.gstatic.com\/firebasejs\//},args=>({path:require.resolve('firebase/'+args.path.match(/firebase-(app|auth|database)\.js/)[1])}));
 build.onResolve({filter:/\.js\?v=/},args=>({path:path.resolve(path.dirname(args.importer),args.path.split('?')[0])}));
 build.onLoad({filter:/firebase-config\.js$/},()=>({contents:"export const firebaseConfig={apiKey:'demo-key',authDomain:'demo-bussole.firebaseapp.com',projectId:'demo-bussole',databaseURL:'https://demo-bussole-default-rtdb.firebaseio.com'}",loader:'js'}));
 build.onLoad({filter:/account-service\.js$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('const db=getDatabase(app);',"const db=getDatabase(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);")+"\nimport {connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';import {connectDatabaseEmulator} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';",loader:'js',resolveDir:root}));
 }}]});
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname;try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.webmanifest')?'application/manifest+json':'application/javascript');res.end(file==='/account.js'?build.outputFiles[0].text:fs.readFileSync(path.join(root,file)));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://localhost:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{
  await db.ref('dailyReminderConfig').set({enabled:false,senderUid:'reminder-bot',publicVapidKey:keys.publicKey});
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Berlin',permissions:['notifications']});
  await context.addInitScript(()=>{
   window.__permissions=0;window.__permission='granted';window.__previews=[];window.__unsubscribed=0;window.__sub=null;
   Object.defineProperty(Notification,'permission',{configurable:true,get:()=>window.__permission});
   Notification.requestPermission=async()=>{window.__permissions++;return window.__permission};
   PushManager.prototype.getSubscription=async()=>window.__sub;
   PushManager.prototype.subscribe=async options=>window.__sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-phone',options,toJSON(){return{endpoint:this.endpoint,expirationTime:null,keys:{auth:'a'.repeat(22),p256dh:'b'.repeat(87)}}},async unsubscribe(){window.__unsubscribed++;window.__sub=null;return true;}};
   ServiceWorkerRegistration.prototype.showNotification=async(title,options)=>window.__previews.push({title,options});
   navigator.geolocation.getCurrentPosition=()=>{throw Error('Reminder requested location')};
  });
  await context.grantPermissions(['notifications'],{origin});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('TEST BROWSER ERROR',m.text())});page.on('dialog',dialog=>dialog.accept());
  await page.goto(origin+'/account.html');await page.locator('#showRegister').click();await page.locator('#accountEmail').fill('daily-reminder-ui@example.test');await page.locator('#accountPassword').fill('Explorer123!');await page.locator('#authSubmit').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('Account created'));
  const owner=(await admin.getUserByEmail('daily-reminder-ui@example.test')).uid;await admin.updateUser(owner,{emailVerified:true});await page.locator('#checkVerification').click();await page.waitForFunction(()=>document.getElementById('dailyReminderStatus').textContent.includes('prepared'));
  assert.equal(await page.locator('#enableDailyReminder').isDisabled(),true);assert.equal(await page.evaluate(()=>window.__permissions),0);
  await db.ref('dailyReminderConfig/enabled').set(true);await page.reload();await page.locator('#enableDailyReminder').waitFor();await page.waitForFunction(()=>!document.getElementById('enableDailyReminder').disabled);
  await page.evaluate(()=>window.__permission='denied');await page.locator('#enableDailyReminder').click();await page.waitForFunction(()=>document.getElementById('dailyReminderStatus').textContent.includes('not allowed'));assert.equal((await db.ref(`dailyReminderDevices/${owner}`).get()).exists(),false);
  await page.evaluate(()=>window.__permission='granted');await page.locator('#enableDailyReminder').click();await page.waitForFunction(()=>document.getElementById('dailyReminderStatus').textContent.startsWith('On for')).catch(async error=>{console.error('REMINDER STATUS',await page.locator('#dailyReminderStatus').textContent(),await page.evaluate(()=>({permission:Notification.permission,calls:window.__permissions,unsubscribed:window.__unsubscribed,device:localStorage.getItem('bussole.dailyReminderDevice.v1')})),errors);throw error;});
  const devices=(await db.ref(`dailyReminderDevices/${owner}`).get()).val(),id=Object.keys(devices)[0];assert.equal(devices[id].timeZone,'Europe/Berlin');assert.doesNotMatch(JSON.stringify(devices),/lat|lon|heading|target|roomCode/);assert.equal((await db.ref(`dailyReminderJourneys/${owner}/tenths`).get()).val(),0);
  await page.locator('#testDailyReminder').click();await page.waitForFunction(()=>window.__previews.length===1);assert.match(await page.evaluate(()=>window.__previews[0].options.body),/0%/);
  const localBinding=await page.evaluate(async()=>{const cache=await caches.open('bussole-daily-reminder-preferences-v1');return(await(await cache.match(new URL('daily-reminder-state',location.href))).json()).binding});assert.equal(localBinding,devices[id].binding);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#dailyReminderPanel').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/bussole-daily-reminder-ui.png'});
  await page.locator('#disableDailyReminder').click();await page.waitForFunction(()=>document.getElementById('dailyReminderStatus').textContent.startsWith('Off on'));assert.equal((await db.ref(`dailyReminderDevices/${owner}`).get()).exists(),false);assert.equal(await page.evaluate(()=>window.__unsubscribed),1);
  await page.locator('#enableDailyReminder').click();await page.waitForFunction(()=>document.getElementById('dailyReminderStatus').textContent.startsWith('On for'));await page.locator('#signOut').click();await page.locator('#accountAuth').waitFor({state:'visible'});assert.equal((await db.ref(`dailyReminderDevices/${owner}`).get()).exists(),false);
  assert.deepEqual(errors,[]);await context.close();console.log('Reminder browser + real SDK/emulators: config gate, explicit permission/denial, private enrollment and SW binding, test preview, mobile layout, opt-out and logout cleanup passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));await adminApp.delete();}
})().catch(error=>{console.error(error);process.exitCode=1});
