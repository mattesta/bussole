// Social snapshots contain statistical values and virtual km, never emails or routes.
(function(root){
 function balance(snapshot,day){
  if(!snapshot||!Number.isInteger(snapshot.asOfDay)||snapshot.asOfDay>day)return null;
  const missedBefore=snapshot.lastDay<0?0:Math.max(0,snapshot.asOfDay-1-snapshot.lastDay);
  const missedNow=snapshot.lastDay<0?0:Math.max(0,day-1-snapshot.lastDay);
  const cost=root.BussoleDailyProgress.penalty(missedNow)-root.BussoleDailyProgress.penalty(missedBefore);
  const km=Math.max(0,snapshot.tenths-cost)/10;
  return {km,percent:km/40075*100};
 }
 function snapshot(data,day){
  const profile=data.profile||{},generation=profile.generation;
  const attempts=Object.fromEntries(Object.entries(data.dailyAttempts||{}).filter(([,r])=>r.generation===generation));
  const progress=root.BussoleDailyProgress.calculate(attempts,day,generation);
  const journey={asOfDay:day,tenths:Math.round(progress.km*10),lastDay:progress.lastDay??-1};
  const samples=root.BussoleAccountStatistics.select(Object.values(data.samples||{}).filter(r=>r.generation===generation)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const bests=Object.values(data.soloBests||{}).filter(r=>r.generation===generation).map(({generation,...r})=>r);
  const current=Object.fromEntries(Object.entries(data.samples||{}).filter(([,row])=>row.generation===generation));
  const proShots=root.BussoleAccountStatistics.bestShotEntries(current).map(row=>{const saved=Object.values(data.proShots||{}).find(shot=>shot.sampleId===row.id&&shot.generation===generation);return {points:row.points,destination:saved?.destination||'Destination not saved'};});
  return {generation,samples,bests,journey,proShots};
 }
 function ranked(entries,day){
  const rows=Object.entries(entries||{}).map(([uid,r])=>({uid,name:r.name||'Explorer',...balance(r,day)})).filter(r=>Number.isFinite(r.km)).sort((a,b)=>b.km-a.km||a.name.localeCompare(b.name)||a.uid.localeCompare(b.uid));
  rows.forEach((r,i)=>{r.rank=i&&r.km===rows[i-1].km?rows[i-1].rank:i+1;});return rows;
 }
 root.BussoleSocialModel={balance,snapshot,ranked};
})(window);
