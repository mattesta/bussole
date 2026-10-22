// Web Push only: no fetch interception, page caching, location or Firebase credentials.
const CACHE='bussole-daily-reminder-preferences-v1';
const stateURL=new URL('daily-reminder-state',self.registration.scope).href;
async function preference(){try{const response=await (await caches.open(CACHE)).match(stateURL);return response?await response.json():{};}catch{return {};}}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='bussole-reminder-preference'||!event.source?.url||new URL(event.source.url).origin!==self.location.origin)return;
 const binding=event.data.binding;if(binding!==null&&!/^[a-f0-9]{32}$/.test(binding||''))return;
 event.waitUntil((async()=>{
  try{const cache=await caches.open(CACHE);await cache.put(stateURL,new Response(JSON.stringify({binding}),{headers:{'Content-Type':'application/json'}}));if(!binding)for(const notification of await self.registration.getNotifications())if(notification.tag.startsWith('bussole-daily-'))notification.close();event.ports[0]?.postMessage({ok:true});}
  catch{event.ports[0]?.postMessage({ok:false});}
 })());
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data.json();}catch{return;}
  const state=await preference(),age=Date.now()-data.sentAt;
  if(data.type!=='bussole-daily-reminder'||!state.binding||data.binding!==state.binding||!Number.isFinite(data.percent)||data.percent<0||!Number.isFinite(age)||age< -300000||age>3600000||!/^\d{4}-\d{2}-\d{2}$/.test(data.date||''))return;
  const world=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(data.percent);
  await self.registration.showNotification('La Daily Challenge ti aspetta! 🌍',{body:`Hai completato il ${world}% del giro del mondo.`,icon:new URL('apple-touch-icon.png',self.registration.scope).href,tag:`bussole-daily-${data.date}`,renotify:false,data:{binding:state.binding}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const state=await preference();if(!state.binding||event.notification.data?.binding!==state.binding)return;
  const target=new URL('?daily=1',self.registration.scope).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(client.url===target){await client.focus();return;}
  await self.clients.openWindow(target);
 })());
});
