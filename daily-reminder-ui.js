import {auth,onAuthStateChanged} from './account-service.js?v=7';
import * as reminder from './daily-reminder-service.js?v=1';
const byId=id=>document.getElementById(id);let config=null,version=0;
const buttons=['enableDailyReminder','disableDailyReminder','testDailyReminder'];
async function render(){
 const run=++version;buttons.forEach(id=>byId(id).disabled=true);
 const status=byId('dailyReminderStatus'),user=auth.currentUser;
 if(!user?.emailVerified||!user?.email){status.textContent='Sign in and verify your email to enable reminders.';return;}
 const unsupported=reminder.support();if(unsupported){status.textContent=unsupported;return;}
 try{
  config=await reminder.configuration();if(run!==version)return;
  const active=config&&await reminder.refreshDevice();if(run!==version)return;
  if(!config){status.textContent='Daily reminders are being prepared. No notifications are scheduled yet.';return;}
  status.textContent=active?`On for this device · around 17:00 (${reminder.currentDevice().timeZone}).`:'Off on this device. Enable to receive the Daily and your current world progress around 17:00.';
  byId('enableDailyReminder').disabled=Boolean(active);byId('disableDailyReminder').disabled=!active;byId('testDailyReminder').disabled=!active;
 }catch{if(run===version)status.textContent='Reminder settings are unavailable. Try again when connected.';}
}
for(const [id,task] of [['enableDailyReminder',()=>reminder.enable(config)],['disableDailyReminder',()=>reminder.disable()],['testDailyReminder',()=>reminder.testNotification()]]){
 byId(id).addEventListener('click',()=>{
  buttons.forEach(key=>byId(key).disabled=true);
  // Start the permission call before awaiting anything else.
  task().then(()=>render()).catch(error=>{byId('dailyReminderStatus').textContent=error.message;byId('enableDailyReminder').disabled=!config;byId('disableDailyReminder').disabled=!reminder.currentDevice();byId('testDailyReminder').disabled=!reminder.currentDevice();});
 });
}
onAuthStateChanged(auth,()=>{if(reminder.foreignDevice())reminder.disable().catch(()=>{}).finally(render);else render();});

window.addEventListener('bussole-account-refresh',render);
