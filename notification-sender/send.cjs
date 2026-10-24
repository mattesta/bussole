// Uses a dedicated Firebase password identity, never Admin SDK credentials.
const webpush=require('web-push'),{validDevice,payload,localTime}=require('./model.cjs');
const DB='https://bussole-game-default-rtdb.europe-west1.firebasedatabase.app';
const API_KEY='AIzaSyDF8QBnk0qhEQoNMLfomt9WivloW--66cQ';
async function run({request=fetch,send=webpush.sendNotification.bind(webpush),now=Date.now()}={}){
 const raw=process.env.BUSSOLE_REMINDERS_SECRET;if(!raw){console.log('Daily reminders are not configured; nothing sent.');return;}
 const secret=JSON.parse(raw),configResponse=await request(`${DB}/dailyReminderConfig.json`);
 if(!configResponse.ok)throw Error('Cannot read reminder configuration.');const config=await configResponse.json();
 if(!config?.enabled){console.log('Daily reminders are disabled; nothing sent.');return;}
 if(!/^[A-Za-z0-9_-]{87}$/.test(config.publicVapidKey||'')||!config.senderUid)throw Error('Invalid public reminder configuration.');
 webpush.setVapidDetails('https://mattesta.github.io/bussole/',config.publicVapidKey,secret.vapidPrivateKey);
 const login=await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:secret.email,password:secret.password,returnSecureToken:true})});
 if(!login.ok)throw Error('Reminder sender sign-in failed.');const auth=await login.json();if(auth.localId!==config.senderUid||!auth.idToken)throw Error('Sender identity does not match configuration.');
 async function api(path,options={}){
  // RTDB REST requires Firebase ID tokens in auth=. Never log requests or errors containing URLs.
  return request(`${DB}/${path}.json?auth=${encodeURIComponent(auth.idToken)}`,{...options,signal:AbortSignal.timeout(20000)});
 }
 const list=await api('dailyReminderDevices');if(!list.ok)throw Error('Cannot read push registrations.');const users=await list.json()||{};
 let sent=0,skipped=0,failed=0;
 for(const [uid,devices] of Object.entries(users)){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))continue;
  const candidates=Object.entries(devices||{}).filter(([id,d])=>/^[a-f0-9]{64}$/.test(id)&&validDevice(d)&&localTime(d.timeZone,now)?.due);
  if(!candidates.length)continue;
  const completionPath=`accountData/${uid}/dailyAttempts/${Math.floor(now/86400000)}/score`;
  const snapshotResponse=await api(`dailyReminderJourneys/${uid}`);
  if(!snapshotResponse.ok){if(snapshotResponse.status===401||snapshotResponse.status===403){for(const [id] of candidates){const path=`dailyReminderDevices/${uid}/${id}`,live=await api(path,{headers:{'X-Firebase-ETag':'true'}});if(live.ok)await api(path,{method:'DELETE',headers:{'if-match':live.headers.get('etag')}});await api(`dailyReminderDeliveries/${uid}/${id}`,{method:'DELETE'});}}else failed++;skipped+=candidates.length;continue;}const snapshot=await snapshotResponse.json();
  const completion=await api(completionPath);if(!completion.ok){failed++;skipped+=candidates.length;continue;}if(Number.isInteger(await completion.json())){skipped+=candidates.length;continue;}
  for(const [id,device] of candidates){
   const devicePath=`dailyReminderDevices/${uid}/${id}`,deliveryPath=`dailyReminderDeliveries/${uid}/${id}`;
   const message=payload(device,snapshot,now);if(!message){skipped++;continue;}
   // Compare-and-set protects opt-out/token replacement during cleanup.
   const live=await api(devicePath,{headers:{'X-Firebase-ETag':'true'}});if(!live.ok){failed++;continue;}const current=await live.json();
   if(current?.binding!==device.binding){skipped++;continue;}
   if(now-device.updatedAt>90*86400000){await api(devicePath,{method:'DELETE',headers:{'if-match':live.headers.get('etag')}});await api(deliveryPath,{method:'DELETE'});skipped++;continue;}
   const previousResponse=await api(deliveryPath,{headers:{'X-Firebase-ETag':'true'}});if(!previousResponse.ok){failed++;continue;}const previous=await previousResponse.json();
   if(previous?.date===message.date&&(previous.sent||previous.leaseUntil>now)){skipped++;continue;}
   const lease={date:message.date,leaseUntil:now+120000,sent:false,binding:device.binding};
   const claim=await api(deliveryPath,{method:'PUT',headers:{'Content-Type':'application/json','if-match':previousResponse.headers.get('etag')},body:JSON.stringify(lease)});
   if(claim.status===412){skipped++;continue;}if(!claim.ok){failed++;continue;}
   const check=await api(devicePath);const stillRegistered=check.ok?await check.json():null;
   if(stillRegistered?.binding!==device.binding){skipped++;continue;}
   const completedNow=await api(completionPath);if(!completedNow.ok){failed++;continue;}if(Number.isInteger(await completedNow.json())){skipped++;continue;}
   try{
    await send(device.subscription,JSON.stringify(message),{TTL:1800,urgency:'normal',topic:`daily-${message.date}`});
    const done=await api(deliveryPath,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lease,sent:true,leaseUntil:0})});if(!done.ok)failed++;sent++;
   }catch(error){
    if([404,410].includes(error.statusCode)){
     await api(devicePath,{method:'DELETE',headers:{'if-match':live.headers.get('etag')}});await api(deliveryPath,{method:'DELETE'});
    }else{failed++;await api(deliveryPath,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lease,leaseUntil:0})});}
   }
  }
 }
 console.log(`Daily reminders: ${sent} accepted by push service, ${skipped} skipped, ${failed} failed.`);
 if(failed)throw Error('Some reminder deliveries failed.');
 return {sent,skipped,failed};
}
if(require.main===module)run().catch(()=>{console.error('Daily reminder run failed. Check configuration, sender permissions and service status. No credentials or device data were logged.');process.exitCode=1;});
module.exports={run};
