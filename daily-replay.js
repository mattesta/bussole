// Own Daily geometry stays in browser storage, scoped by account, generation and UTC day.
const PREFIX='bussole-daily-replay-v1:';
export function saveDailyReplay(uid,generation,day,report){
 if(!uid||!generation||!Number.isInteger(day)||report?.rounds?.length!==5)return false;
 try{localStorage.setItem(PREFIX+uid,JSON.stringify({generation,day,report}));return true;}catch{return false;}
}
export function dailyReplay(uid,generation,day){
 try{
  const value=JSON.parse(localStorage.getItem(PREFIX+uid)||'null');
  if(value&&value.day<day){localStorage.removeItem(PREFIX+uid);return null;}
  return value?.generation===generation&&value.day===day&&value.report?.rounds?.length===5?value.report:null;
 }catch{return null;}
}
export function clearDailyReplay(uid){try{localStorage.removeItem(PREFIX+uid);}catch{}}
export function openReplay(report,returnTo='daily'){
 if(!report?.rounds?.length)throw Error('No shots are available on this device.');
 try{sessionStorage.setItem('bussoleMatchReport',JSON.stringify(report));}catch{throw Error('Allow site storage to open your shots.');}
 location.href=`match-summary.html?return=${returnTo==='account'?'account':returnTo==='game'?'game':'daily'}`;
}
