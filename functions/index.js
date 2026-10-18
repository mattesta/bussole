const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const {onValueWritten}=require('firebase-functions/v2/database');
const functionsV1=require('firebase-functions/v1');
const {randomUUID}=require('node:crypto');
const {aggregate}=require('./community');
initializeApp();
// A small prototype pool is rebuilt from the current source of truth. This makes
// retries, deletion, consent revocation and out-of-order events idempotent. No
// per-account comparison cache is retained. Move to batched/sharded aggregation
// before substantial traffic; this implementation reads the full statistics pool.
exports.refreshCommunityStatistics=onValueWritten({
  ref:'/accountData/{uid}',instance:'bussole-game-default-rtdb',region:'europe-west1',retry:true,
  concurrency:1,maxInstances:1,timeoutSeconds:60
},async()=>{
  const db=getDatabase(),lock=db.ref('accountInternal/aggregateLock'),token=randomUUID();
  const acquired=await lock.transaction(value=>!value||value.expiresAt<Date.now()?{token,expiresAt:Date.now()+90000}:undefined);
  if(!acquired.committed)throw new Error('Statistics refresh is busy; retry this event.');
  try{
    const accounts=(await db.ref('accountData').get()).val()||{};
    await db.ref('communityStatistics').set(aggregate(accounts));
  }finally{
    await lock.transaction(value=>value?.token===token?null:undefined);
  }
});
// Also remove personal data if an account is deleted through the Firebase console.
exports.removeDeletedAccountData=functionsV1.region('europe-west1').auth.user().onDelete(user=>getDatabase().ref(`accountData/${user.uid}`).remove());
