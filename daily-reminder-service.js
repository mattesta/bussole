import {auth,db,ready,loadProfile,ref,get,set,update,serverTimestamp} from './account-service.js?v=9';
import {journey} from './daily-service.js?v=7';
const localKey='bussole.dailyReminderDevice.v1';
const verified=()=>Boolean(auth.currentUser?.emailVerified&&auth.currentUser?.email);
const base=new URL('./',import.meta.url);
function saved(){try{return JSON.parse(localStorage.getItem(localKey))||{};}catch{return {};}}
function remember(value){localStorage.setItem(localKey,JSON.stringify(value));}
export function support(){
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(ios&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches)return 'On iPhone or iPad, add Bussole to your Home Screen and open it from there first.';
 if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return 'Push notifications are not supported in this browser. Try Bussole from a supported browser or installed Home Screen app.';
 return null;
}
export async function configuration(){const value=(await get(ref(db,'dailyReminderConfig'))).val();return value?.enabled&&/^[A-Za-z0-9_-]{87}$/.test(value.publicVapidKey||'')?value:null;}
const registration=()=>navigator.serviceWorker.register(new URL('daily-reminder-sw.js',base),{scope:base.pathname});
async function activated(worker){
 if(worker.active)return worker;
 await new Promise((resolve,reject)=>{const candidate=worker.installing||worker.waiting;if(!candidate)return reject(Error('Notification service could not start.'));const timer=setTimeout(()=>reject(Error('Notification service timed out. Retry.')),15000);candidate.addEventListener('statechange',()=>{if(candidate.state==='activated'){clearTimeout(timer);resolve();}else if(candidate.state==='redundant'){clearTimeout(timer);reject(Error('Notification service could not start.'));}});});return worker;
}
async function tell(worker,binding){
 const active=(await activated(worker)).active;
 await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Notification preferences could not be saved on this device.')),5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve():reject(Error('Notification preferences could not be saved on this device.'));};active.postMessage({type:'bussole-reminder-preference',binding},[channel.port2]);});
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const keyBytes=key=>Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)),c=>c.charCodeAt(0));
export function foreignDevice(){const device=saved();return Boolean(device.uid&&device.uid!==auth.currentUser?.uid);}
export async function syncIfEnrolled(){await ready();if(verified()&&(await get(ref(db,`dailyReminderDevices/${auth.currentUser.uid}`))).exists())await syncJourney();}
export function currentDevice(){const value=saved();return verified()&&value.uid===auth.currentUser.uid?value:null;}
export async function syncJourney(){
 await ready();if(!verified())return;
 const uid=auth.currentUser.uid,profile=await loadProfile(),progress=await journey(uid);
 if(!progress||auth.currentUser?.uid!==uid)return;
 await set(ref(db,`dailyReminderJourneys/${uid}`),{generation:profile.generation,asOfDay:progress.asOfDay,tenths:Math.round(progress.km*10),lastDay:progress.lastDay??-1});
}
export async function enable(config){
 const reason=support();if(reason)throw Error(reason);
 if(!verified())throw Error('Sign in and verify your email first.');
 if(!config)throw Error('Daily reminders are not available yet.');
 // Must be requested synchronously in the user's tap, particularly on iOS.
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not allowed. You can change this in your phone or browser settings.');
 const uid=auth.currentUser.uid,worker=await activated(await registration());
 let subscription=await worker.pushManager.getSubscription();
 if(subscription&&subscription.options.applicationServerKey){const expected=keyBytes(config.publicVapidKey),actual=new Uint8Array(subscription.options.applicationServerKey);if(hex(expected)!==hex(actual)){await subscription.unsubscribe();subscription=null;}}
 if(!subscription)subscription=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicVapidKey)});
 const deviceId=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint))));
 const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,binding=hex(crypto.getRandomValues(new Uint8Array(16)));
 if(auth.currentUser?.uid!==uid)throw Error('Your account changed. Please retry.');
 await syncJourney();
 await set(ref(db,`dailyReminderDevices/${uid}/${deviceId}`),{subscription:subscription.toJSON(),timeZone,binding,updatedAt:serverTimestamp()});
 try{await tell(worker,binding);remember({uid,deviceId,binding,timeZone});}catch(error){await set(ref(db,`dailyReminderDevices/${uid}/${deviceId}`),null).catch(()=>{});throw error;}
 return {timeZone};
}
export async function disable(){
 const device=saved();
 // Disable locally first so late/in-flight pushes cannot display after logout.
 if('serviceWorker' in navigator){const worker=await navigator.serviceWorker.getRegistration(base.href);if(worker)await tell(worker,null).catch(()=>{});}
 localStorage.removeItem(localKey);
 let cleanupFailed=false;
 if(device.uid&&device.deviceId&&auth.currentUser?.uid===device.uid){
  try{await update(ref(db),{[`dailyReminderDevices/${device.uid}/${device.deviceId}`]:null,[`dailyReminderDeliveries/${device.uid}/${device.deviceId}`]:null});}catch{cleanupFailed=true;}
 }
 // Unsubscribe removes the endpoint at the push service, even if offline DB cleanup failed.
 const worker=await navigator.serviceWorker?.getRegistration(base.href);const subscription=await worker?.pushManager.getSubscription();if(subscription)await subscription.unsubscribe();
 if(cleanupFailed)throw Error('Notifications are off on this device. Server cleanup could not finish; retry when connected.');
}
export async function refreshDevice(){
 const device=currentDevice();if(!device)return false;
 const record=(await get(ref(db,`dailyReminderDevices/${device.uid}/${device.deviceId}`))).val();
 if(!record||record.binding!==device.binding||Notification.permission!=='granted'){await disable();return false;}
 const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 await update(ref(db,`dailyReminderDevices/${device.uid}/${device.deviceId}`),{updatedAt:serverTimestamp(),timeZone});remember({...device,timeZone});await syncJourney();return true;
}
export async function testNotification(){
 const device=currentDevice();if(!device)throw Error('Enable Daily reminders on this device first.');
 const progress=await journey(device.uid),worker=await activated(await registration());
 await worker.showNotification('Daily Challenge · test',{body:`Hai completato il ${new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(progress?.percent||0)}% del giro del mondo 🌍`,icon:new URL('apple-touch-icon.png',base).href,tag:'bussole-daily-test'});
}
