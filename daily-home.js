import { inspect, start, watch } from './daily-service.js?v=6';
const byId=id=>document.getElementById(id),daily=window.BussoleDaily;
let state,stopWatch,loading=false;
function description(day){return `The same 5 targets for everyone. Normal · 30 s timer · Blur ${daily.settings(day).blurEnabled?'on':'off'}. A new challenge at 00:00 UTC.`;}
function active(){return window.BussoleHome.soloType()==='daily';}
async function prepare(){
 if(loading)return;loading=true;stopWatch?.();window.BussoleDailyProgress.render(byId('dailyTravel'),null);
 try{
  state=await inspect();if(!active())return;
  window.BussoleDailyProgress.render(byId('dailyTravel'),state.journey);
  byId('soloDescription').textContent=description(state.day);
  byId('startSoloBtn').textContent=state.eligible&&!state.attempt?'Start official challenge':'Play unranked';
  byId('dailyInfo').textContent=`${daily.date(state.day)} · `+(!state.eligible?'Sign in and verify your email for an official attempt and to collect kilometres. You can play unranked now.':state.attempt?.score!==undefined?`Today's official score: ${state.attempt.score} / 5000. Further games are unranked.${state.sharingPending?' Your score is stored, but sharing is pending. Reopen Daily Challenge to retry.':''}`:state.attempt?'Your official attempt has already started. Further games are unranked.':'One official attempt today. Starting uses your attempt; leaving or reloading ends it. Your final score is shared without your name or location.');
  if(state.attempt?.score!==undefined&&!state.sharingPending){
   byId('dailyComparison').classList.remove('hidden');
   stopWatch=watch(state.day,state.attempt.score,state.attempt.entryKey,result=>{byId('dailyComparison').textContent=daily.describe(result,state.day);},()=>{byId('dailyComparison').textContent='The comparison is temporarily unavailable.';});
  }
 }catch{state=null;if(active()){byId('startSoloBtn').textContent='Play unranked';byId('dailyInfo').textContent='The daily service is unavailable. You can still play unranked; your score will not be submitted.';}}
 finally{loading=false;if(active())byId('startSoloBtn').disabled=false;}
}
async function launch(access){
 const permissions=await access;
 if(!permissions.coordinates||!permissions.orientationGranted)throw Error('Location and compass access are needed before starting the daily challenge. Check permissions and try again.');
 let ticket={day:daily.day(Date.now()),official:false};
 // Storage must work before reserving an official attempt on the server.
 try{sessionStorage.setItem('bussoleDailyLaunch',JSON.stringify(ticket));}catch{throw Error('Enable session storage to start the daily challenge.');}
 if(state?.eligible&&!state.attempt){
  try{ticket=await start();}catch{throw Error('The official attempt could not be started. Check your connection and the updated Firebase rules, then retry.');}
 }else try{const fresh=await inspect();ticket.day=fresh.day;}catch{ /* Unranked games can use the local UTC day. */ }
 sessionStorage.setItem('bussoleDailyLaunch',JSON.stringify(ticket));
 const config=daily.settings(ticket.day);
 location.href=`globe-prototype.html?integrated=1&solo=daily&day=${ticket.day}&mode=${config.mode}&timer=${config.timerSeconds}${config.blurEnabled?'&blur=1':''}`;
}
window.BussoleHome.registerDaily({prepare,launch,leave(){stopWatch?.();stopWatch=null;window.BussoleDailyProgress.render(byId('dailyTravel'),null);}});

// Open the Daily lobby only; the user still starts the official attempt explicitly.
if(new URLSearchParams(location.search).get('daily')==='1'){byId('singlePlayerBtn').click();byId('soloDailyBtn').click();}
