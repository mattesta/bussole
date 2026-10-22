const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),model=require('../notification-sender/model.cjs');
const context={window:{}};vm.runInNewContext(fs.readFileSync('daily-progress.js','utf8'),context);const calculate=context.window.BussoleDailyProgress.calculate;
for(const date of ['2026-07-01T15:00:00Z','2026-12-01T16:00:00Z'])assert.equal(model.localTime('Europe/Berlin',Date.parse(date)).due,true);
assert.equal(model.localTime('Europe/Berlin',Date.parse('2026-10-22T14:59:00Z')).due,false);
assert.equal(model.localTime('Europe/Berlin',Date.parse('2026-10-22T15:45:00Z')).due,false);
assert.equal(model.localTime('Invalid/Zone',Date.now()),null);
assert.equal(model.localTime('America/New_York',Date.parse('2026-07-01T21:00:00Z')).due,true);
for(const url of ['http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.test/x','https://127.0.0.1/x','https://web.push.apple.com@evil.test/x','https://web.push.apple.com:8443/x','https://evil.test/x'])assert.equal(model.allowedEndpoint(url),false);
assert.equal(model.allowedEndpoint('https://web.push.apple.com/Qx/a'),true);
assert.equal(model.allowedEndpoint('https://fcm.googleapis.com/fcm/send/x'),true);
let seed=42;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let i=0;i<200;i++){
 const history={};for(let day=100;day<=130;day++)if(random()<.5)history[day]={score:Math.floor(random()*5001)};
 const progress=calculate(history,130),snapshot={asOfDay:130,tenths:Math.round(progress.km*10),lastDay:progress.lastDay??-1};
 for(let day=130;day<140;day++)assert.equal(model.percent(snapshot,day),calculate(history,day).percent);
}
assert.equal(model.percent(null,100),null);assert.equal(model.percent({asOfDay:101,tenths:10,lastDay:100},100),null);
(async()=>{
 const handlers={},store=new Map(),shown=[],closed=[];const now=Date.parse('2026-10-22T15:00:00Z');
 const sw={registration:{scope:'https://mattesta.github.io/bussole/',getNotifications:async()=>[{tag:'bussole-daily-old',close(){closed.push(true)}}],showNotification:async(title,options)=>shown.push({title,options})},location:{origin:'https://mattesta.github.io'},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>shown.push({url})},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers[name]=fn};
 const c={self:sw,caches:{open:async()=>({match:async key=>store.get(key)?.clone(),put:async(key,value)=>store.set(key,value)})},URL,Response,Intl,Date:class extends Date{static now(){return now}}};vm.runInNewContext(fs.readFileSync('daily-reminder-sw.js','utf8'),c);
 const binding='a'.repeat(32);let work;
 handlers.message({source:{url:'https://mattesta.github.io/bussole/account.html'},data:{type:'bussole-reminder-preference',binding},ports:[{postMessage(){}}],waitUntil(p){work=p}});await work;
 const push=async data=>{handlers.push({data:{json:()=>data},waitUntil(p){work=p}});await work;};
 const data={type:'bussole-daily-reminder',binding,date:'2026-10-22',sentAt:now,percent:12.345};
 await push(data);assert.equal(shown.length,1);assert.match(shown[0].options.body,/12,35%/);assert.equal(shown[0].options.tag,'bussole-daily-2026-10-22');
 await push({...data,binding:'b'.repeat(32)});await push({...data,sentAt:now-7200000});assert.equal(shown.length,1);
 handlers.message({source:{url:'https://mattesta.github.io/bussole/account.html'},data:{type:'bussole-reminder-preference',binding:null},ports:[{postMessage(){}}],waitUntil(p){work=p}});await work;await push(data);assert.equal(shown.length,1);assert.equal(closed.length,1);
 console.log('Daily reminders: DST/time zones, 200 wallet histories, SSRF boundaries, private push payload, worker binding/expiry and local opt-out passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
