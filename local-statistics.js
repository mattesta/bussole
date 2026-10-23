// Detailed error tuples can reveal location. This module has NO network API.
const DATABASE='bussole-device-statistics-v1',STORE='samples';
let opening;
const unavailable=()=>Error('Device storage is unavailable. Allow site storage to save private statistics. No detailed errors are uploaded.');
function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(unavailable());
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{
   const store=request.result.createObjectStore(STORE,{keyPath:['uid','generation','id']});
   store.createIndex('owner','uid');store.createIndex('ownerGeneration',['uid','generation']);
  };
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
  request.onerror=request.onblocked=()=>reject(unavailable());
 }).catch(()=>{opening=null;throw unavailable();});
 return opening;
}
async function transaction(mode,work){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);let result;
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(unavailable());
  try{work(tx.objectStore(STORE),value=>{result=value;});}catch{tx.abort();}
 });
}
export async function saveLocalSamples(uid,generation,values){
 const rows=Object.entries(values||{}).filter(([,row])=>row?.generation===generation).map(([id,row])=>{
  const sample=window.BussoleAccountStatistics.clean(row);return sample?{uid,generation,id,...sample}:null;
 }).filter(Boolean);
 await transaction('readwrite',store=>{for(const row of rows)store.put(row);});
}
export async function loadLocalSamples(uid,generation){
 return transaction('readonly',(store,done)=>{
  const request=store.index('ownerGeneration').getAll(IDBKeyRange.only([uid,generation]));
  request.onsuccess=()=>done(Object.fromEntries(request.result.map(({uid,id,...sample})=>[id,sample])));
 });
}
export async function clearLocalSamples(uid){
 await transaction('readwrite',store=>{
  const request=store.index('owner').openCursor(IDBKeyRange.only(uid));
  request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
 });
}
