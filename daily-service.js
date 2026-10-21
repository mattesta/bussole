import { auth, db, ready, beginRound, ref, get, runTransaction, set, onValue, serverTimestamp } from './account-service.js?v=3';
const daily=window.BussoleDaily;
const verified=()=>Boolean(auth.currentUser?.emailVerified&&auth.currentUser?.email);
export async function today(){
 const offset=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{stop();reject(Error('The daily clock is unavailable.'));},10000);
  const stop=onValue(ref(db,'.info/serverTimeOffset'),snapshot=>{clearTimeout(timeout);resolve(snapshot.val());},error=>{clearTimeout(timeout);reject(error);},{onlyOnce:true});
 });
 return daily.day(Date.now()+(Number(offset)||0));
}
export async function journey(expectedUid,asOfDay){
 await ready();if(!verified()||(expectedUid&&auth.currentUser.uid!==expectedUid))return null;
 const uid=auth.currentUser.uid;
 const [day,attempts,generation]=await Promise.all([
  Number.isInteger(asOfDay)?Promise.resolve(asOfDay):today(),
  get(ref(db,`accountData/${uid}/dailyAttempts`)),get(ref(db,`accountData/${uid}/profile/generation`))
 ]);
 if(!verified()||auth.currentUser.uid!==uid||!generation.exists())return null;
 return window.BussoleDailyProgress.calculate(attempts.val(),day,generation.val());
}
export async function inspect(){
 await ready();const day=await today();
 if(!verified())return {day,eligible:false,attempt:null};
 const uid=auth.currentUser.uid,attempt=(await get(ref(db,`accountData/${uid}/dailyAttempts/${day}`))).val();
 let sharingPending=false;
 // Recover a completed private result if the separate public write was interrupted.
 if(attempt?.score!==undefined)try{await complete({...attempt,uid,day,official:true},attempt.score);}catch{sharingPending=true;}
 return {day,eligible:true,attempt,sharingPending,journey:await journey(uid,day)};
}
export async function start(){
 await ready();const day=await today(),owner=await beginRound();
 if(!owner)return {day,official:false};
 const entryKey=crypto.randomUUID(),attemptRef=ref(db,`accountData/${owner.uid}/dailyAttempts/${day}`);
 const claim=await runTransaction(attemptRef,previous=>previous?undefined:{entryKey,generation:owner.generation,startedAt:serverTimestamp(),version:1});
 return {day,official:claim.committed,...(claim.committed?{uid:owner.uid,generation:owner.generation,entryKey}:{})};
}
export async function complete(ticket,score){
 if(!ticket?.official)return {saved:false};
 await ready();if(!verified()||auth.currentUser.uid!==ticket.uid)throw Error('Sign back in to the same verified account to submit this result.');
 if(!Number.isInteger(score)||score<0||score>5000)throw Error('Invalid daily score.');
 const attemptRef=ref(db,`accountData/${ticket.uid}/dailyAttempts/${ticket.day}`);
 // Transactions may initially receive null even after get(). Seed that first
 // proposal from an explicit read; the server's compare-and-swap still resolves races.
 const initial=(await get(attemptRef)).val();
 if(initial?.entryKey!==ticket.entryKey||initial.generation!==ticket.generation)throw Error('This daily attempt is no longer available.');
 const result=await runTransaction(attemptRef,previous=>{
  const current=previous||initial;
  if(current.entryKey!==ticket.entryKey||current.generation!==ticket.generation)return;
  if(current.score!==undefined)return;
  return {...current,score};
 });
 const record=result.snapshot.val()||initial;
 if(record?.entryKey!==ticket.entryKey||record.score!==score)throw Error('This daily attempt cannot be replaced.');
 const scoreRef=ref(db,`dailyScores/${ticket.day}/${ticket.entryKey}`);
 const existing=await get(scoreRef);
 if(!existing.exists())await set(scoreRef,score);
 return {saved:true,score:record.score};
}
export function watch(day,score,key,onComparison,onError){
 return onValue(ref(db,`dailyScores/${day}`),snapshot=>onComparison(daily.comparison(snapshot.val(),score,key)),onError);
}
