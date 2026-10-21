// Virtual Daily kilometres are derived from private official results, never GPS routes.
(function(root){
 const EARTH_KM=40075,PENALTY_POINTS=5000;
 function calculate(attempts={},asOfDay,generation){
  if(!Number.isInteger(asOfDay)||asOfDay<0)throw Error('Invalid UTC day.');
  const rows=Object.entries(attempts||{}).filter(([key,row])=>/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<=asOfDay&&row&&Number.isInteger(row.score)&&row.score>=0&&row.score<=5000&&(generation===undefined||row.generation===generation)).map(([key,row])=>({day:Number(key),score:row.score})).sort((a,b)=>a.day-b.day);
  let balance=0,missedDays=0,previous=rows[0]?.day-1;
  for(const row of rows){
   const missing=row.day-previous-1;missedDays+=missing;
   balance=Math.max(0,balance-missing*PENALTY_POINTS)+row.score;
   previous=row.day;
  }
  if(rows.length){const trailing=Math.max(0,asOfDay-1-previous);missedDays+=trailing;balance=Math.max(0,balance-trailing*PENALTY_POINTS);}
  const km=balance/10,today=rows.find(row=>row.day===asOfDay);
  return {asOfDay,started:rows.length>0,km,percent:km/EARTH_KM*100,completed:rows.length,firstDay:rows[0]?.day??null,lastDay:rows.at(-1)?.day??null,missedDays,todayCompleted:Boolean(today),earnedTodayKm:today?today.score/10:0};
 }
 const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
 function percent(value){return value>0&&value<.01?'<0.01':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);}
 function render(element,summary,earnedKm){
  if(!element)return;
  element.classList.toggle('hidden',!summary);element.replaceChildren();if(!summary)return;
  const title=document.createElement('span');title.className='daily-travel-title';title.textContent='Daily journey';
  const distance=document.createElement('strong');distance.className='daily-travel-distance';distance.textContent=`${number(summary.km)} km`;
  const around=document.createElement('span');around.className='daily-travel-percent';around.textContent=`You have travelled ${percent(summary.percent)}% of Earth's circumference.`;
  const note=document.createElement('small');note.className='daily-travel-note';
  note.textContent=summary.started?'100 km per 1,000 points · −500 km per missed UTC day · Minimum 0 km.':'Complete your first official Daily to start. Earn up to 500 km per challenge; then −500 km per missed UTC day, never below zero.';
  element.append(title,distance,around);
  if(Number.isFinite(earnedKm)){const earned=document.createElement('span');earned.className='daily-travel-earned';earned.textContent=`+${number(earnedKm)} km from this challenge`;element.append(earned);}
  element.append(note);
 }
 root.BussoleDailyProgress={EARTH_KM,calculate,number,render};
})(window);
