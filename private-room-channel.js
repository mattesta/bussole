import {roomIdentity} from './private-room-crypto.js?v=1';
import {ref,onValue,runTransaction,update} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';

// Private rooms only. Firebase relays public keys and ciphertext, never the secret keys.
export async function privateRoomChannel({db,uid,room,meta,onLines,onStatus}){
 if(meta.visibility!=='private')return null;
 const identity=await roomIdentity(uid,room,meta.createdAt,meta.round),path=suffix=>`rooms/${room}/${suffix}`;
 const registered=await runTransaction(ref(db,path(`lineKeys/${meta.round}/${uid}`)),old=>old||identity.publicKey);
 if(registered.snapshot.val()!==identity.publicKey)throw Error('Private lines need the original room tab. Scores are still available.');
 let keys={},state=null,stopped=false,stopLines=null,revision=0;
 const sent=new Set(),pending=new Set();
 async function publish(){
  const current=state;
  if(!current?.submission||stopped)return;
  const jobs=Object.entries(keys).filter(([peer])=>peer!==uid&&current.players[peer]&&(current.players[peer].eligibleRound||1)<=current.round);
  await Promise.all(jobs.map(async([peer,publicKey])=>{
   const id=`${current.round}:${peer}`;if(sent.has(id)||pending.has(id))return;pending.add(id);
   try{
    const packet=await identity.seal(publicKey,current.round,uid,peer,current.submission);
    if(stopped||state!==current)return;
    await update(ref(db,path(`sealedLines/${current.round}/${uid}`)),{[peer]:packet});sent.add(id);
   }catch{if(!stopped&&state===current)onStatus('A private line could not be shared. Scores are still available.');}
   finally{pending.delete(id);}
  }));
 }
 async function render(){
  const current=state,version=++revision;if(!current||stopped)return;
  const lines={};
  await Promise.all(Object.entries(current.packets||{}).map(async([sender,recipients])=>{
   if(sender===uid||!current.players[sender]||(current.players[sender].eligibleRound||1)>current.round||!keys[sender]||!recipients?.[uid])return;
   try{lines[sender]=await identity.open(keys[sender],current.round,sender,uid,recipients[uid]);}catch{} // Reject forged/tampered packets without exposing their contents.
  }));
  if(!stopped&&state===current&&version===revision)onLines(lines,current.round);
 }
 const stopKeys=onValue(ref(db,path(`lineKeys/${meta.round}`)),snapshot=>{keys=snapshot.val()||{};publish();render();},()=>onStatus('Private line exchange unavailable. Scores are still available.'));
 return {
  reveal({round,players,submission}){
   if(stopped)return;
   if(state?.round===round)return;
   stopLines?.();state={round,players:structuredClone(players),submission,packets:{}};
   stopLines=onValue(ref(db,path(`sealedLines/${round}`)),snapshot=>{if(state?.round!==round)return;state.packets=snapshot.val()||{};render();},()=>onStatus('Private lines unavailable. Scores are still available.'));
   publish();
  },
  stop(){stopped=true;revision++;state=null;stopKeys();stopLines?.();}
 };
}
