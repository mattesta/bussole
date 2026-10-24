const EARTH_KM=40075;
const penalty=n=>n<=0?0:n===1?1000:3000*(n-1);
function percent(snapshot,day){
 if(!snapshot||!Number.isInteger(snapshot.asOfDay)||snapshot.asOfDay>day||!Number.isInteger(snapshot.tenths)||snapshot.tenths<0||!Number.isInteger(snapshot.lastDay)||snapshot.lastDay< -1||snapshot.lastDay>snapshot.asOfDay)return null;
 const before=snapshot.lastDay<0?0:Math.max(0,snapshot.asOfDay-1-snapshot.lastDay),after=snapshot.lastDay<0?0:Math.max(0,day-1-snapshot.lastDay);
 return Math.max(0,snapshot.tenths-penalty(after)+penalty(before))/10/EARTH_KM*100;
}
function localTime(timeZone,now){
 try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,due:parts.hour==='17'&&Number(parts.minute)<45};}catch{return null;}
}
function allowedEndpoint(endpoint){
 try{const url=new URL(endpoint);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&endpoint.length<=4096&&(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
function validDevice(device){return Boolean(device&&typeof device.binding==='string'&&/^[a-f0-9]{32}$/.test(device.binding)&&typeof device.timeZone==='string'&&device.timeZone.length<=80&&Number.isFinite(device.updatedAt)&&allowedEndpoint(device.subscription?.endpoint)&&/^[A-Za-z0-9_-]{22}$/.test(device.subscription?.keys?.auth||'')&&/^[A-Za-z0-9_-]{87}$/.test(device.subscription?.keys?.p256dh||''));}
function payload(device,snapshot,now){
 const time=localTime(device.timeZone,now),world=percent(snapshot,Math.floor(now/86400000));
 if(!time?.due||world===null||snapshot.lastDay===Math.floor(now/86400000))return null;
 return {type:'bussole-daily-reminder',binding:device.binding,date:time.date,sentAt:now,percent:world};
}
module.exports={percent,localTime,allowedEndpoint,validDevice,payload};
