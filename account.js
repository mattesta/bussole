import {highlights} from './private-geometry.js?v=1';
import './daily-reminder-ui.js?v=3';
import * as accounts from './account-service.js?v=9';
import { today } from './daily-service.js?v=7';
import * as social from './social-service.js?v=6';
const byId=id=>document.getElementById(id),show=(id,visible)=>byId(id).classList.toggle('hidden',!visible);
let loadedOwner=null,registration=false,data={},mode='all',days=0,busy=false,travelDay=null,stopConnections=null,socialScope='friends',selectedFriend=null,currentConnections={},friendRenderVersion=0;
function message(text,error=false){byId('accountStatus').textContent=text;byId('accountStatus').classList.toggle('error',error);}
async function action(work){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{await work();}catch(error){message(accounts.friendlyError(error),true);}
  finally{busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false);if(accounts.auth.currentUser&&!accounts.auth.currentUser.emailVerified){byId('leaderboardOptIn').disabled=true;}byId('connectGoogle').disabled=accounts.hasGoogle();window.dispatchEvent(new Event('bussole-account-refresh'));}
}
async function refresh(){
  const user=await accounts.ready();show('accountAuth',!user);show('accountDetails',Boolean(user));
  closeShotGlobe();
  stopConnections?.();stopConnections=null;show('friendStatistics',false);selectedFriend=null;currentConnections={};friendRenderVersion++;byId('friendList').replaceChildren();
  if(!user){data={};message('An account is optional. Guest games are not added to your history.');return;}
  byId('signedInEmail').textContent=user.email;byId('connectGoogle').textContent=accounts.hasGoogle()?'Google connected':'Connect Google';byId('connectGoogle').disabled=accounts.hasGoogle();show('emailSecurity',accounts.hasPassword());byId('googleSecurityNote').textContent=accounts.hasGoogle()?'Google is connected. Leave Current password blank to confirm sensitive changes with Google. You can add an email/password login by setting a new password.':'Connecting Google keeps this account and its statistics. Guest games are never imported.';show('verificationPanel',!user.emailVerified);
  data=await accounts.loadData();loadedOwner=user.uid;const profile={...accounts.defaultProfile,...data.profile};
  byId('accountUsername').value=profile.username;byId('useUsernameInRooms').checked=profile.useInRooms;
  byId('leaderboardOptIn').checked=Boolean(profile.leaderboardOptIn);byId('leaderboardOptIn').disabled=!user.emailVerified;
  await renderJourney();renderBests();renderBestShots();renderStatistics();
  const claimed=profile.username?await accounts.usernameOwner(profile.username).catch(()=>null):null;
  byId('usernameStatus').textContent=profile.username&&claimed!==user.uid?'Save preferences to reserve your existing username. If it is taken, choose a different one.':'';
  await refreshSocial();message(data.localStatisticsError|| (user.emailVerified?'Your account is ready.':'Verify your email to start saving statistics.'),Boolean(data.localStatisticsError));
}
async function renderJourney(){
 const element=byId('dailyTravel'),status=byId('dailyTravelStatus');travelDay=null;
 window.BussoleDailyProgress.render(element,null);byId('dailyAverage').textContent='';
 if(!accounts.auth.currentUser?.emailVerified){status.textContent='Verify your email to collect Daily kilometres.';return;}
 try{
  travelDay=await today();
  window.BussoleDailyProgress.render(element,window.BussoleDailyProgress.calculate(data.dailyAttempts,travelDay,data.profile?.generation));
  const progress=window.BussoleDailyProgress.calculate(data.dailyAttempts,travelDay,data.profile?.generation);
  byId('dailyAverage').textContent=progress.completed?`Daily average: ${window.BussoleDailyProgress.number(progress.averageScore)} / 5,000 points · ${progress.completed} completed challenges. Missed and unfinished days are excluded.`:'Complete an official Daily to see your average.';
  status.textContent='Only completed official Daily challenges count. Today is not missed until 00:00 UTC. Earth’s circumference: approximately 40,075 km.';
 }catch{status.textContent='Your journey is temporarily unavailable. Refresh when connected.';}
}
function renderBests(){
  const list=byId('soloBestList');list.replaceChildren();
  const records=Object.values(data.soloBests||{}).filter(record=>record.generation===data.profile?.generation);
  if(!records.length){const item=document.createElement('li');item.textContent='No completed games yet.';list.append(item);return;}
  records.sort((a,b)=>['easy','medium','hard'].indexOf(a.mode)-['easy','medium','hard'].indexOf(b.mode)||a.timerSeconds-b.timerSeconds||Number(a.blurEnabled)-Number(b.blurEnabled));
  for(const record of records){
    const item=document.createElement('li');
    const difficulty={easy:'Easy',medium:'Normal',hard:'Pro'}[record.mode];
    item.textContent=`${difficulty} · ${record.timerSeconds?`${record.timerSeconds} s`:'No timer'} · Blur ${record.blurEnabled?'on':'off'} — ${record.score} / 5000`;
    list.append(item);
  }
}
function closeShotGlobe(){const frame=byId('privateShotFrame');frame.src='about:blank';byId('privateShotDialog').close();}
function openShotGlobe(id){
 if(accounts.auth.currentUser?.uid!==loadedOwner)return;
 const shot=highlights(loadedOwner,data.profile?.generation)[id];if(!shot||shot.generation!==data.profile?.generation)return;
 const report={version:1,uid:'owner',solo:true,publicRoom:true,rounds:[{round:1,mode:'hard',target:shot.target,entries:[{uid:'owner',name:'You',color:'#e41a1c',errorColor:'#ff8587',submission:shot.submission}]}]};
 const frame=byId('privateShotFrame');frame.onload=()=>frame.contentWindow.postMessage({type:'bussole-match-report',report},location.origin);
 frame.src='match-summary.html?embedded=1';byId('privateShotDialog').showModal();
}
byId('closePrivateShot').onclick=closeShotGlobe;
accounts.onAuthStateChanged(accounts.auth,closeShotGlobe);
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===byId('privateShotFrame').contentWindow&&['bussole-summary-close','bussole-summary-home'].includes(event.data?.type))closeShotGlobe();});
byId('privateShotDialog').addEventListener('close',()=>{byId('privateShotFrame').onload=null;byId('privateShotFrame').src='about:blank';});
function renderBestShots(){
 const list=byId('proBestShotList');list.replaceChildren();
 const shots=Object.values(data.proShots||{}).sort((a,b)=>b.points-a.points);
 for(const shot of shots){
  const item=document.createElement('li');
  item.textContent=`${shot.points} / 1,000 points · ${shot.destination||'Destination not saved'}`;
  if(highlights(loadedOwner,data.profile?.generation)[shot.sampleId]){const button=document.createElement('button');button.type='button';button.textContent='View on globe · this device';button.onclick=()=>openShotGlobe(shot.sampleId);item.append(button);}
  else{const note=document.createElement('small');note.textContent='Globe replay is stored only on the device where you made this shot.';item.append(note);}
  list.append(item);
 }
 if(!shots.length){const item=document.createElement('li');item.textContent='No saved Pro guesses yet.';list.append(item);}
}

const format=(value,unit,signed=false)=>Number.isFinite(value)?`${signed&&value>0?'+':''}${(Math.round(value*10)/10||0).toFixed(1)}${unit}`:'—';
function metric(list,label,value,unit,signed=false,explanation='',chart){
  const term=document.createElement('dt');term.textContent=label;const detail=document.createElement('dd'),number=document.createElement('strong');
  number.textContent=format(value,unit,signed);detail.append(number);
  if(explanation){const note=document.createElement('span');note.textContent=explanation;detail.append(note);}
  if(chart)detail.append(chart);list.append(term,detail);
}
function renderStatistics(){
  const rows=window.BussoleAccountStatistics.select(data.samples,{mode,days});
  const stats=window.BussoleAccountStatistics.summarize(rows),list=byId('personalMetrics');list.replaceChildren();
  byId('personalStatsCount').textContent=`${stats.count} completed ${stats.count===1?'guess':'guesses'}${stats.count?'':' — your future verified games will appear here'}.`;
  metric(list,'Mean relative error',stats.relativeError,'%',false,'Final error relative to target distance.');
  metric(list,'Mean absolute angle error',stats.absoluteAngle,'°');
  metric(list,'Directional bias',stats.angleBias,'°',true,stats.angleSamples.length&&stats.angleBias===null?'No clear mean direction.':'Positive: right. Negative: left.',window.BussoleSummaryCharts.angle(stats.angleSamples,stats.angleBias));
  if(mode==='hard'||rows.some(row=>row.mode==='hard')){
    metric(list,'Mean absolute distance error · Pro',stats.absoluteDistance,'%');
    metric(list,'Distance bias · Pro',stats.distanceBias,'%',true,'Positive: too long. Negative: too short.',window.BussoleSummaryCharts.distance(stats.distanceSamples,stats.distanceBias));
  }
}
function setRegistration(value){
  registration=value;byId('showLogin').classList.toggle('selected',!value);byId('showRegister').classList.toggle('selected',value);
  byId('showLogin').setAttribute('aria-pressed',String(!value));byId('showRegister').setAttribute('aria-pressed',String(value));
  show('registerPrivacy',value);show('resetPassword',!value);byId('authSubmit').textContent=value?'Create account':'Sign in';
  byId('accountPassword').autocomplete=value?'new-password':'current-password';byId('accountPassword').minLength=value?8:1;
}
byId('showLogin').onclick=()=>setRegistration(false);byId('showRegister').onclick=()=>setRegistration(true);
byId('authForm').onsubmit=event=>{event.preventDefault();action(async()=>{
  const email=byId('accountEmail').value,password=byId('accountPassword').value;
  const result=registration?await accounts.register(email,password):await accounts.login(email,password);
  byId('accountPassword').value='';await refresh();
  if(registration)message(result.verificationSent?'Account created. Check your inbox to verify your email.':'Account created. Tap “Send email again” to verify your email.');
});};
byId('resetPassword').onclick=()=>action(async()=>{const input=byId('accountEmail');if(!input.reportValidity())return;await accounts.resetPassword(input.value);message('If an account uses this email, you will receive password reset instructions.');});
byId('resendVerification').onclick=()=>action(async()=>{await accounts.resendVerification();message('Verification email sent. Check your inbox and spam folder.');});
byId('checkVerification').onclick=()=>action(async()=>{const verified=await accounts.refreshVerification();await refresh();if(!verified)message('The email is not verified yet. Open the link in your email, then retry.');});
byId('profileForm').onsubmit=event=>{event.preventDefault();action(async()=>{
  await accounts.saveProfile({username:byId('accountUsername').value,useInRooms:byId('useUsernameInRooms').checked,leaderboardOptIn:byId('leaderboardOptIn').checked});
  await refresh();message('Preferences saved.');
});};
for(const id of ['modeFilters','dateFilters'])byId(id).onclick=event=>{
  const button=event.target.closest('button');if(!button)return;
  if(id==='modeFilters')mode=button.dataset.mode;else days=Number(button.dataset.days);
  byId(id).querySelectorAll('button').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button));});renderStatistics();
};
const password=()=>{if(accounts.hasGoogle()&&!byId('currentPassword').value)return null;const input=byId('currentPassword');if(!input.value)throw new Error('Enter your current password in Security first.');return input.value;};
byId('changePassword').onclick=()=>action(async()=>{const next=byId('newPassword');if(next.value.length<8||!next.reportValidity())throw new Error('Choose a password with at least 8 characters.');await accounts.changePassword(password(),next.value);byId('securityForm').reset();await refresh();message('Password changed.');});
byId('changeEmail').onclick=()=>action(async()=>{const input=byId('newEmail');if(!input.value||!input.reportValidity())throw new Error('Enter your new email address.');await accounts.changeEmail(password(),input.value);byId('securityForm').reset();message('Open the verification link sent to your new email to finish changing it.');});
byId('exportAccount').onclick=()=>action(async()=>{
  const values=await accounts.loadData();
  const exported={version:1,dailyReminderDevices:await accounts.get(accounts.ref(accounts.db,`dailyReminderDevices/${accounts.auth.currentUser.uid}`)).then(row=>row.val()||{}).catch(()=>({})),privateProShots:Object.values(highlights(loadedOwner,values.profile?.generation)).map(({generation,sampleId,...shot})=>shot),connections:await social.connections().catch(()=>null),dailyJourney:travelDay===null?null:window.BussoleDailyProgress.calculate(values.dailyAttempts,travelDay,values.profile?.generation),email:accounts.auth.currentUser.email,profile:values.profile||{},samples:window.BussoleAccountStatistics.select(values.samples),soloBests:Object.values(values.soloBests||{}).map(({generation,...record})=>record),dailyAttempts:Object.entries(values.dailyAttempts||{}).map(([day,record])=>({day:Number(day),status:record.score===undefined?'started':'completed',...(record.score===undefined?{}:{score:record.score})}))};
  delete exported.profile.generation;
  const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='bussole-my-data.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Your data export is ready.');
});
byId('deleteStatistics').onclick=()=>action(async()=>{
  if(!confirm('Delete device statistics, personal bests and daily scores? This cannot be undone.'))return;
  await accounts.deleteStatistics();await refresh();message('Your statistics have been deleted from this device and your cloud records have been reset.');
});
byId('deleteAccount').onclick=()=>action(async()=>{
  const currentPassword=password();if(!confirm('Delete your account and all personal statistics? This cannot be undone.'))return;
  await accounts.deleteAccount(currentPassword);byId('securityForm').reset();await refresh();message('Your account and personal statistics have been deleted. Device copies elsewhere cannot be erased remotely.');
});
byId('signOut').onclick=()=>action(async()=>{await accounts.logout();byId('securityForm').reset();await refresh();});

byId('googleSignIn').onclick=byId('connectGoogle').onclick=()=>action(async()=>{await accounts.google();await refresh();message('Google is connected. Your account is ready.');});
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function socialButton(text,handler){const button=element('button',text);button.type='button';button.onclick=()=>action(handler);return button;}
async function renderFriends(links){
 currentConnections=links;const version=++friendRenderVersion;
 if(selectedFriend&&links[selectedFriend]?.state!=='accepted'){show('friendStatistics',false);selectedFriend=null;}
 const list=byId('friendList');list.replaceChildren();
 for(const [uid,entry] of Object.entries(links)){
  const profile=await social.publicProfile(uid).catch(()=>null);if(version!==friendRenderVersion)return;if(!profile)continue;
  const item=element('li'),name=element('strong',profile.name||'Explorer');item.append(name);
  if(entry.state==='accepted'){
   item.append(element('span','Friend'),socialButton('Records',()=>viewFriend(uid)),socialButton('Remove',async()=>{if(confirm('Remove this friendship and stop sharing statistics?'))await social.remove(uid);}));
  }else if(entry.requestedBy===accounts.auth.currentUser?.uid)item.append(element('span','Request sent'),socialButton('Cancel',()=>social.remove(uid)));
  else item.append(element('span','Wants to be friends'),socialButton('Accept',async()=>{if(confirm('Accept this friend and share your personal bests and Daily journey with each other?'))await social.accept(uid);}),socialButton('Decline',()=>social.remove(uid)));
  list.append(item);
 }
 if(!list.children.length)list.append(element('li','No friends or requests yet. Share your link to get started.'));
}
async function refreshSocial(){
 if(!accounts.auth.currentUser?.emailVerified){byId('socialStatus').textContent='Verify your email to use friends and rankings.';return;}
 try{
  await social.syncOwn();byId('socialStatus').textContent='Friends see records and Daily progress after you both accept. Detailed errors stay on your device.';
  stopConnections=social.watchConnections(links=>renderFriends(links).catch(()=>{}),()=>{byId('socialStatus').textContent='Friend access is temporarily unavailable.';});
  const invite=new URLSearchParams(location.search).get('friend');if(invite)byId('friendInvite').value=new URL(location.href).href;
 }catch{byId('socialStatus').textContent='Friends and rankings are being prepared. Updated Firebase rules are required; your personal statistics still work.';}
}
async function viewFriend(uid){
 const owner=accounts.auth.currentUser?.uid,value=await social.friend(uid);if(accounts.auth.currentUser?.uid!==owner||currentConnections[uid]?.state!=='accepted')throw Error('This friendship is no longer active.');selectedFriend=uid;show('friendStatistics',true);
 byId('friendStatisticsName').textContent=value.profile?.name||'Explorer';const share=value.share||{};
 const currentDay=await today(),balance=window.BussoleSocialModel.balance(share.journey,currentDay);
 window.BussoleDailyProgress.render(byId('friendJourney'),balance?{...balance,started:true}:null);
 byId('friendBests').replaceChildren();for(const best of Object.values(share.bests||{}))byId('friendBests').append(element('li',`${{easy:'Easy',medium:'Normal',hard:'Pro'}[best.mode]} · ${best.timerSeconds?best.timerSeconds+' s':'No timer'} · Blur ${best.blurEnabled?'on':'off'} — ${best.score} / 5000`));
 byId('friendProShots').replaceChildren();for(const shot of Object.values(share.proShots||{}))byId('friendProShots').append(element('li',`${shot.points} / 1,000 points · ${shot.destination}`));
 byId('friendStatistics').scrollIntoView({block:'start',behavior:'smooth'});
}
async function renderLeaderboard(){
 const list=byId('journeyRanking');list.replaceChildren();byId('socialStatus').textContent='Loading ranking…';
 await social.syncOwn();const {rows}=await social.leaderboard(socialScope);
 byId('socialStatus').textContent=`${socialScope==='global'?'Global leaderboard':'Friends ranking'} · ${rows.length} ${rows.length===1?'player':'players'}`;
 for(const row of rows){const item=element('li',`#${row.rank} · ${row.name}${row.uid===accounts.auth.currentUser?.uid?' ★':''} — ${window.BussoleDailyProgress.number(row.km)} km · ${row.percent.toFixed(2)}%`);list.append(item);}
 if(!rows.length)list.append(element('li',socialScope==='global'?'No players have opted in yet.':'Your friends will appear here after accepting.'));
}
for(const [id,scope] of [['friendsTab','friends'],['friendsBoardTab','friends-board'],['globalBoardTab','global']])byId(id).onclick=()=>action(async()=>{
 socialScope=scope;show('friendsView',scope==='friends');show('leaderboardView',scope!=='friends');
 for(const tab of ['friendsTab','friendsBoardTab','globalBoardTab'])byId(tab).classList.toggle('selected',tab===id);
 if(scope!=='friends')await renderLeaderboard();else byId('socialStatus').textContent='Friends see records and Daily progress after you both accept. Detailed errors stay on your device.';
});
byId('refreshLeaderboard').onclick=()=>action(renderLeaderboard);
byId('closeFriendStatistics').onclick=()=>{show('friendStatistics',false);selectedFriend=null;};
byId('friendRequestForm').onsubmit=event=>{event.preventDefault();action(async()=>{await social.request(await social.resolveFriend(byId('friendInvite').value));byId('friendInvite').value='';byId('socialStatus').textContent='Friend request sent.';});};
byId('copyFriendLink').onclick=()=>{
 const user=accounts.auth.currentUser;if(!user?.emailVerified){message('Sign in and verify your email first.',true);return;}
 const url=new URL('account.html',location.href);url.searchParams.set('friend',user.uid);const input=byId('myFriendLink');input.value=url.href;show('myFriendLink',true);
 const copy=navigator.clipboard?.writeText(url.href)||Promise.reject(Error('Copy unavailable'));
 const publication=social.enableProfile();
 Promise.all([copy.catch(()=>{input.select();}),publication]).then(()=>{byId('socialStatus').textContent='Your friend link is ready. Copy it and send it to someone you know.';}).catch(error=>{byId('socialStatus').textContent=accounts.friendlyError(error);});
};
setRegistration(false);action(refresh);
