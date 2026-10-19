import { completeGame } from './account-game.js?v=2';
const parameters=new URLSearchParams(location.search);
if(parameters.get('solo')==='game'&&parameters.get('multiplayer')!=='1'){
 const byId=id=>document.getElementById(id),show=(id,visible)=>byId(id).classList.toggle('hidden',!visible);
 let game,report,saving=false;
 const panel=byId('soloGameResults'),next=byId('soloNextRoundBtn'),badge=byId('globeRoomBadge'),frame=byId('matchSummaryFrame');
 const settings={mode:parameters.get('mode'),timerSeconds:parameters.get('timer'),blurEnabled:parameters.get('blur')==='1'};
 function progress(){
  byId('soloRoundLabel').textContent=`Round ${game.round} / 5`;
  byId('globeRoomProgress').textContent=`${game.total} pts · ${game.round}/5`;
  next.disabled=game.phase==='aiming'||saving;
  next.textContent=game.phase==='finished'?'Play again':'Next round';
 }
 function dismiss(){
  if(game.phase==='aiming')return;
  panel.classList.add('hidden');badge.classList.add('results-available');
 }
 function showResults(){panel.classList.remove('hidden');badge.classList.remove('results-available');}
 async function saveRecord(){
  if(saving)return;saving=true;progress();show('soloSaveRetry',false);
  byId('soloRecordStatus').textContent='Checking your personal best…';
  try{
   const result=await completeGame(game.settings,game.total);
   byId('soloRecordStatus').textContent=!result.saved?'Sign in with a verified account before starting a game to save personal bests.'
    :result.isNew?`New personal best: ${result.best} / 5000 points!`:`Personal best with these settings: ${result.best} / 5000 points.`;
  }catch{
   byId('soloRecordStatus').textContent='Your game is complete, but the record could not be saved. Check your connection and retry.';
   show('soloSaveRetry',true);
  }finally{saving=false;progress();}
 }
 function finish(submission,points,errorMeters){
  if(!game.finish(submission,points,errorMeters))return;
  document.activeElement?.blur();document.body.classList.add('round-revealed');
  byId('soloResultsTitle').textContent=game.phase==='finished'?'Game results':`Round ${game.round} / 5`;
  byId('soloRoundScore').textContent=`${points} / 1000 points${submission?'':' · DNF'} · Total: ${game.total} / 5000`;
  byId('soloRecordStatus').textContent='';
  progress();showResults();show('soloSummaryBtn',game.phase==='finished');
  if(game.phase==='finished'){
   report={version:1,uid:'solo',publicRoom:true,solo:true,rounds:game.results.map(round=>({round:round.round,mode:round.mode,target:round.target,entries:[{uid:'solo',name:'You',color:'#e41a1c',errorColor:'#ff8587',submission:round.submission}]}))};
   saveRecord();
  }
 }
 try{
  game=window.BussoleSoloGame.create(window.BUSSOLE_TARGETS,settings);
  show('soloRoundLabel',true);show('soloNextRoundBtn',true);show('globeRoomBadge',true);
  window.BussoleGlobe.registerSolo({canAim:()=>game.phase==='aiming',dismissResults:dismiss,expire(){
   if(game.phase!=='aiming')return;
   finish(null,0,null);window.BussoleGlobe.revealSoloMiss();
  }});
  window.addEventListener('bussole-solo-result',event=>finish(event.detail.submission,event.detail.points,event.detail.errorMeters));
  next.addEventListener('click',()=>{
   if(saving)return;
   if(game.phase==='finished'){location.reload();return;}
   if(!game.next())return;
   panel.classList.add('hidden');badge.classList.remove('results-available');progress();
   window.BussoleGlobe.setSoloTarget(game.target);
  });
  badge.addEventListener('click',()=>{if(game.phase!=='aiming')showResults();});
  byId('soloSaveRetry').addEventListener('click',saveRecord);
  byId('soloSummaryBtn').addEventListener('click',()=>{
   panel.classList.add('hidden');frame.src='match-summary.html?embedded=1';show('matchSummaryFrame',true);
  });
  frame.addEventListener('load',()=>{if(report)frame.contentWindow.postMessage({type:'bussole-match-report',report},location.origin);});
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
   if(event.data?.type==='bussole-summary-close'){show('matchSummaryFrame',false);frame.src='about:blank';showResults();}
   else if(event.data?.type==='bussole-summary-home')location.href='./';
  });
  byId('prototypeBackLink').addEventListener('click',event=>{
   if(game.phase!=='finished'&&!confirm('Leave this game? A personal best is recorded only after all 5 rounds.'))event.preventDefault();
  });
  progress();window.BussoleGlobe.setSoloTarget(game.target);
 }catch(error){window.BussoleGlobe.setStatus(error.message);next.disabled=true;}
}
