const assert=require('node:assert/strict'),webpush=require('../notification-sender/node_modules/web-push'),{run}=require('../notification-sender/send.cjs');
(async()=>{
 const keys=webpush.generateVAPIDKeys(),uid='owner',id='a'.repeat(64),now=Date.parse('2026-10-22T15:00:00Z'),day=Math.floor(now/86400000);
 const device={binding:'b'.repeat(32),timeZone:'Europe/Berlin',updatedAt:now,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{auth:'a'.repeat(22),p256dh:'b'.repeat(87)}}};
 process.env.BUSSOLE_REMINDERS_SECRET=JSON.stringify({email:'test@bussole.invalid',password:'never-log',vapidPrivateKey:keys.privateKey});
 const state={dailyReminderConfig:{enabled:true,senderUid:'bot',publicVapidKey:keys.publicKey},dailyReminderDevices:{[uid]:{[id]:device}},dailyReminderJourneys:{[uid]:{generation:'g',asOfDay:day,tenths:10000,lastDay:day}},dailyReminderDeliveries:{}};let pushes=0;
 function get(path){return path.split('/').reduce((a,b)=>a?.[b],state)??null;}
 function put(path,value){const parts=path.split('/');let parent=state;for(const key of parts.slice(0,-1))parent=parent[key]??={};if(value===null)delete parent[parts.at(-1)];else parent[parts.at(-1)]=value;}
 const etag=path=>JSON.stringify(require('node:crypto').createHash('sha256').update(JSON.stringify(get(path))).digest('hex'));
 const request=async(input,options={})=>{
  const url=new URL(input);if(url.hostname==='identitytoolkit.googleapis.com')return Response.json({localId:'bot',idToken:'private-id-token'});
  assert.equal(url.hostname,'bussole-game-default-rtdb.europe-west1.firebasedatabase.app');const path=url.pathname.slice(1,-5);
  assert.ok(!path.startsWith('accountData/'),'Sender must never read private account history');
  if(path!=='dailyReminderConfig')assert.equal(url.searchParams.get('auth'),'private-id-token');
  if(options.method==='PUT'||options.method==='DELETE'){
   if(options.headers?.['if-match']&&options.headers['if-match']!==etag(path))return new Response(null,{status:412});
   put(path,options.method==='DELETE'?null:JSON.parse(options.body));return Response.json(null);
  }
  return Response.json(get(path),{headers:{etag:etag(path)}});
 };
 const send=async(sub,body)=>{pushes++;const p=JSON.parse(body);assert.equal(p.type,'bussole-daily-reminder');assert.ok(p.percent>0);assert.doesNotMatch(body,/lat|lon|heading|target|email|password|token/);};
 await run({request,send,now});assert.equal(pushes,1);await run({request,send,now:now+600000});assert.equal(pushes,1);
 state.dailyReminderDevices[uid][id].binding='c'.repeat(32);state.dailyReminderDeliveries={};let attempts=0;
 await assert.rejects(run({request,send:async()=>{attempts++;throw Error('temporary')},now}));await run({request,send,now});assert.equal(attempts,1);assert.equal(pushes,2);
 state.dailyReminderDeliveries={};await run({request,send:async()=>{throw {statusCode:410}},now});assert.equal(get(`dailyReminderDevices/${uid}/${id}`),null);
 console.log('Free sender: scoped auth/reads, correct percentage, conditional deduplication, retry and expired-endpoint cleanup passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
