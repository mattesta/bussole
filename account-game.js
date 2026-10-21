import { beginRound, saveSample, saveSoloBest } from './account-service.js?v=4';
const multiplayer=new URLSearchParams(location.search).get('multiplayer')==='1';
let context=multiplayer?Promise.resolve(null):beginRound();
const matchOwner=context;
export async function completeGame(settings,score){return saveSoloBest(await matchOwner,settings,score);}
let saved=false,pending=null,roundVersion=0;
function start(){if(multiplayer)return;roundVersion++;context=beginRound();saved=false;pending=null;status('');}
function status(text){const element=document.getElementById('accountSaveStatus');if(element)element.textContent=text;}
async function record(detail){
  if(saved||pending)return;
  const version=roundVersion;
  const task=(async()=>{
    const owner=await context;if(!owner)return;
    const measured=window.BussoleReportGeometry.measure(detail.submission,detail.target,detail.mode);
    const sample=window.BussoleAccountStatistics.sample(measured,detail.submission,detail.mode,'solo');
    try{if(await saveSample(owner,sample)&&version===roundVersion){saved=true;status('Statistics saved.');}}
    catch{if(version===roundVersion)status('Statistics could not be saved. Check your connection.');}
  })().finally(()=>{if(pending===task)pending=null;});
  pending=task;
  return pending;
}
window.addEventListener('bussole-solo-start',start);
window.addEventListener('bussole-solo-result',event=>record(event.detail));
