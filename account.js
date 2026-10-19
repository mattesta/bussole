import * as accounts from './account-service.js?v=2';
const byId=id=>document.getElementById(id),show=(id,visible)=>byId(id).classList.toggle('hidden',!visible);
let registration=false,data={},mode='all',days=0,busy=false,requestId=0;
function message(text,error=false){byId('accountStatus').textContent=text;byId('accountStatus').classList.toggle('error',error);}
async function action(work){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{await work();}catch(error){message(accounts.friendlyError(error),true);}
  finally{busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false);if(accounts.auth.currentUser&&!accounts.auth.currentUser.emailVerified)byId('communityConsent').disabled=true;}
}
async function refresh(){
  const user=await accounts.ready();show('accountAuth',!user);show('accountDetails',Boolean(user));
  if(!user){data={};message('An account is optional. Guest games are not added to your history.');return;}
  byId('signedInEmail').textContent=user.email;show('verificationPanel',!user.emailVerified);
  data=await accounts.loadData();const profile={...accounts.defaultProfile,...data.profile};
  byId('accountUsername').value=profile.username;byId('useUsernameInRooms').checked=profile.useInRooms;
  byId('communityConsent').checked=profile.communityConsent;byId('communityConsent').disabled=!user.emailVerified;
  renderBests();renderStatistics();message(user.emailVerified?'Your account is ready.':'Verify your email to start saving statistics.');
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
  refreshCommunity();
}
async function refreshCommunity(){
  const id=++requestId,list=byId('communityMetrics');list.replaceChildren();
  const status=byId('communityStatus');
  if(!accounts.auth.currentUser?.emailVerified){status.textContent='Verify your email to see community comparisons.';return;}
  status.textContent='Loading pooled statistics…';
  try{
    const value=await accounts.community(mode);if(id!==requestId)return;
    if(!value?.available){status.textContent='Community statistics need at least 5 contributing players in this difficulty. They will appear here when available.';return;}
    const p=value.contributors===1?'player':'players';
    status.textContent=`${value.contributors} contributing ${p} · ${value.count} guesses · all time. These are pooled results, not individual profiles.`;
    metric(list,'Community mean relative error',value.relativeError,'%');metric(list,'Community mean absolute angle error',value.absoluteAngle,'°');
    if(mode==='hard'||mode==='all')metric(list,'Community mean absolute distance error · Pro',value.absoluteDistance,'%');
  }catch{if(id===requestId)status.textContent='Community comparison is being prepared. Your personal statistics work independently.';}
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
  const previous=Boolean(data.profile?.communityConsent),consent=byId('communityConsent').checked;
  await accounts.saveProfile({username:byId('accountUsername').value,useInRooms:byId('useUsernameInRooms').checked,communityConsent:consent});
  await refresh();message(previous&&!consent?'Preferences saved. Your past community contributions will be removed when the pool refreshes.':'Preferences saved.');
});};
for(const id of ['modeFilters','dateFilters'])byId(id).onclick=event=>{
  const button=event.target.closest('button');if(!button)return;
  if(id==='modeFilters')mode=button.dataset.mode;else days=Number(button.dataset.days);
  byId(id).querySelectorAll('button').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button));});renderStatistics();
};
const password=()=>{const input=byId('currentPassword');if(!input.value)throw new Error('Enter your current password in Security first.');return input.value;};
byId('changePassword').onclick=()=>action(async()=>{const next=byId('newPassword');if(next.value.length<8||!next.reportValidity())throw new Error('Choose a password with at least 8 characters.');await accounts.changePassword(password(),next.value);byId('securityForm').reset();message('Password changed.');});
byId('changeEmail').onclick=()=>action(async()=>{const input=byId('newEmail');if(!input.value||!input.reportValidity())throw new Error('Enter your new email address.');await accounts.changeEmail(password(),input.value);byId('securityForm').reset();message('Open the verification link sent to your new email to finish changing it.');});
byId('exportAccount').onclick=()=>action(async()=>{
  const values=await accounts.loadData();
  const exported={version:1,email:accounts.auth.currentUser.email,profile:values.profile||{},samples:window.BussoleAccountStatistics.select(values.samples),soloBests:Object.values(values.soloBests||{}).map(({generation,...record})=>record)};
  delete exported.profile.generation;
  const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='bussole-my-data.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Your data export is ready.');
});
byId('deleteStatistics').onclick=()=>action(async()=>{
  if(!confirm('Delete all your saved statistics and remove your community contributions? This cannot be undone.'))return;
  await accounts.deleteStatistics();await refresh();message('Your statistics have been deleted. Community contributions are being removed.');
});
byId('deleteAccount').onclick=()=>action(async()=>{
  const currentPassword=password();if(!confirm('Delete your account and all personal statistics? This cannot be undone.'))return;
  await accounts.deleteAccount(currentPassword);byId('securityForm').reset();await refresh();message('Your account and personal statistics have been deleted. Community contributions are being removed.');
});
byId('signOut').onclick=()=>action(async()=>{await accounts.logout();byId('securityForm').reset();await refresh();});
setRegistration(false);action(refresh);
