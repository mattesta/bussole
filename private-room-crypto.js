// Device-only room keys. Only public keys and authenticated ciphertext leave this module.
const PREFIX='bussole-room-key-v1:';
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
const encode=value=>new TextEncoder().encode(value);
const context=(room,createdAt,round,sender,recipient)=>JSON.stringify(['bussole-private-line-v1',room,createdAt,round,sender,recipient]);
function clean(value){
 if(!value||!Number.isFinite(value.lat)||Math.abs(value.lat)>90||!Number.isFinite(value.lon)||Math.abs(value.lon)>180||!Number.isFinite(value.heading)||!Number.isFinite(value.distanceMeters)||value.distanceMeters<0||value.distanceMeters>50000000)throw Error('Invalid private line.');
 return {lat:value.lat,lon:value.lon,heading:value.heading,distanceMeters:value.distanceMeters};
}
export function forgetRoomKey(uid,room,createdAt){try{const prefix=`${PREFIX}${uid}:${room}:${createdAt}:`;for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key);}catch{}}
export function forgetRoomKeys(uid){try{for(const key of Object.keys(sessionStorage))if(key.startsWith(`${PREFIX}${uid}:`))sessionStorage.removeItem(key);}catch{}}
export async function roomIdentity(uid,room,createdAt,round=0){
 const id=`${PREFIX}${uid}:${room}:${createdAt}:${round}`;
 let saved;
 try{
  for(const key of Object.keys(sessionStorage))if(key.startsWith(PREFIX)){
   const row=JSON.parse(sessionStorage.getItem(key));
   if(!row||Date.now()-row.savedAt>86400000)sessionStorage.removeItem(key);
  }
  saved=JSON.parse(sessionStorage.getItem(id)||'null');
 }catch{throw Error('Allow site storage to share encrypted lines in this private room.');}
 if(!saved){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  saved={savedAt:Date.now(),publicKey:base64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};
  try{sessionStorage.setItem(id,JSON.stringify(saved));}catch{throw Error('Allow site storage to share encrypted lines in this private room.');}
 }
 const privateKey=await crypto.subtle.importKey('jwk',saved.privateKey,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 async function key(peer){
  const publicKey=await crypto.subtle.importKey('raw',bytes(peer),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},privateKey,256);
  const material=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encode(JSON.stringify([room,createdAt])),info:encode('bussole-private-line-v1')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 return {
  publicKey:saved.publicKey,
  async seal(peer,round,sender,recipient,line){
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode(context(room,createdAt,round,sender,recipient))},await key(peer),encode(JSON.stringify(clean(line))));
   return {version:1,iv:base64(iv),data:base64(data)};
  },
  async open(peer,round,sender,recipient,packet){
   if(packet?.version!==1||typeof packet.iv!=='string'||packet.iv.length!==16||typeof packet.data!=='string'||packet.data.length>1024)throw Error('Invalid encrypted line.');
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(packet.iv),additionalData:encode(context(room,createdAt,round,sender,recipient))},await key(peer),bytes(packet.data));
   return clean(JSON.parse(new TextDecoder().decode(plain)));
  }
 };
}
