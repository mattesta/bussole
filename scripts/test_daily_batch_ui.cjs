const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fakeMap=`(()=>{
 const handler=()=>({enable(){},disable(){},enableRotation(){},disableRotation(){}});
 class Map{constructor(options){this.options=options;this.camera={center:options.center,zoom:options.zoom};this.canvas=document.createElement('canvas');this.canvas.style='width:100%;height:100%';document.getElementById(options.container).append(this.canvas);this.handlers={};for(const key of ['dragPan','scrollZoom','boxZoom','doubleClickZoom','keyboard','touchZoomRotate'])this[key]=handler();window.__map=this;setTimeout(()=>this.handlers.load?.forEach(fn=>fn()),0)}on(name,fn){(this.handlers[name]||=[]).push(fn);if(name==='click')this.canvas.addEventListener('click',fn);return this}off(){}setProjection(){}addLayer(layer){layer.map=this}triggerRepaint(){}getContainer(){return document.getElementById(this.options.container)}getCanvas(){return this.canvas}project(p){return{x:p[0]*10,y:p[1]*10}}stop(){}jumpTo(camera){this.camera={...camera}}easeTo(camera){this.camera={...camera}}setBearing(bearing){this.camera.bearing=bearing}}
 class Marker{constructor(options){this.element=options.element}setLngLat(p){this.position=p;return this}getLngLat(){return this.position}addTo(map){map.getContainer().append(this.element);return this}remove(){this.element.remove()}}
 class Popup{setLngLat(){return this}setDOMContent(){return this}addTo(){return this}remove(){}}
 window.maplibregl={Map,Marker,Popup};})();`;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{for(const day of [20747,20748]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(day=>{window.__testDay=day;window.DeviceOrientationEvent=class{};Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:48.1,longitude:11.6}})}}});},day);
  await page.route('https://unpkg.com/**',r=>r.fulfill({contentType:r.request().url().includes('.css')?'text/css':'text/javascript',body:r.request().url().includes('.css')?'':fakeMap}));
  await page.route('http://localhost/**',r=>{
   const file=new URL(r.request().url()).pathname;let body;
   if(['/account-home.js','/multiplayer.js','/globe-multiplayer.js'].includes(file))body='';
   else if(file==='/daily-friends-ui.js')body='export function showDailyFriends(){return ()=>{}}';
   else if(file==='/account-service.js')body='export const auth={currentUser:null};export async function loadProfile(){return {}}';
   else if(file==='/account-game.js')body='export async function completeGame(){return {saved:false}}';
   else if(file==='/daily-service.js')body="export async function inspect(){return {day:window.__testDay,eligible:false,attempt:null}};export async function start(){return {day:window.__testDay,official:false}};export async function complete(){return {saved:false}};export function watch(){return ()=>{}};";
   else if(file==='/compass.js')body="window.BussoleCompass={createTracker({onHeading}){let tick;return{start(){onHeading(30);tick=setInterval(()=>onHeading(30),20)},stop(){clearInterval(tick)}}}};";
   else try{body=fs.readFileSync(path.join(root,file==='/'?'index.html':file));}catch{return r.fulfill({status:404,body:'missing'})}
   return r.fulfill({contentType:file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html',body});
  });
  await page.goto('http://localhost/');await page.locator('#singlePlayerBtn').click();await page.locator('#soloDailyBtn').click();await page.waitForFunction(()=>!document.getElementById('startSoloBtn').disabled);
  assert.match(await page.locator('#soloDescription').textContent(),new RegExp(day<20748?'Blur on':'Blur off'));
  await page.locator('#startSoloBtn').click();await page.waitForURL(/solo=daily/);assert.equal(new URL(page.url()).searchParams.get('blur')==='1',day<20748);
  await page.waitForFunction(()=>!document.getElementById('showPrototypeLineBtn').disabled);
  const blur=await page.locator('.blur-circle').evaluateAll(elements=>elements.some(element=>element.style.display!=='none'));assert.equal(blur,day<20748);
  // Both Home and results use the same wording; exact #2/3 and shared ranks are readable on mobile.
  await page.evaluate(()=>{const d=window.BussoleDaily;document.getElementById('soloRecordStatus').textContent=d.describe(d.comparison({own:3000,a:2000,b:4000},3000,'own'));document.getElementById('soloGameResults').classList.remove('hidden');});
  assert.match(await page.locator('#soloRecordStatus').textContent(),/^#2 of 3\. You scored higher than 50%/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(day===20748)await page.screenshot({path:'/tmp/bussole-daily-batch-results.png'});
  assert.deepEqual(errors,[]);await context.close();
 }console.log('Mobile daily batch: pinned blur before/after UTC transition, actual launch URL and globe overlay, rank #2 of 3 and layout passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
