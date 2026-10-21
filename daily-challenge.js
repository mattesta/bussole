// Version 1 is stable: keep its catalogue and PRNG unchanged for identical daily targets.
(function(root){
 // Keep completed/current challenges unchanged; new settings start at a UTC boundary.
 const NO_BLUR_DAY=20748; // 2026-10-22 00:00 UTC
 function settings(value=day(Date.now())){return Object.freeze({mode:'medium',timerSeconds:30,blurEnabled:value<NO_BLUR_DAY});}
 const day=now=>Math.floor(now/86400000);
 const date=value=>new Date(value*86400000).toISOString().slice(0,10);
 function random(value){let state=(value^0x42555331)>>>0;return()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
 function create(catalogue,value){if(!Number.isInteger(value)||value<0)throw Error('Invalid challenge day.');return root.BussoleSoloGame.create(catalogue,settings(value),random(value));}
 function comparison(scores,score,ownKey){
  const others=Object.entries(scores||{}).filter(([key,value])=>key!==ownKey&&Number.isInteger(value)&&value>=0&&value<=5000);
  const beaten=others.filter(([,value])=>value<score).length,tied=others.filter(([,value])=>value===score).length;
  const rank=1+others.filter(([,value])=>value>score).length;
  return {rank,participants:others.length+1,opponents:others.length,beaten,tied,percent:others.length?Math.floor(beaten/others.length*1000)/10:null};
 }
 function describe(result,challengeDay){
  const cohort=challengeDay===undefined||challengeDay===day(Date.now())?"today's other players":`other players for ${date(challengeDay)}`;
  const position=`#${result.rank} of ${result.participants}${result.tied?' · tied':''}`;
  return result.opponents?`${position}. You scored higher than ${result.percent}% of ${cohort}. Updates as players finish.`:`${position}. You are the first to finish this challenge. Updates as players finish.`;
 }
 root.BussoleDaily={settings,day,date,create,comparison,describe};
})(window);
