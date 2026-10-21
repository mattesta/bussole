// Durable statistics deliberately contain no positions, targets, bearings or room IDs.
(function(root) {
  const DAY=86400000;
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  function sample(measured,submission,mode,kind,now=Date.now()) {
    const result={day:Math.floor(now/DAY),mode,kind,points:measured.points};
    if(finite(measured.angleError))result.angleError=measured.angleError;
    if(measured.initialDistance>1e-6) {
      result.relativeError=100*measured.errorMeters/measured.initialDistance;
      if(mode==='hard')result.distanceError=100*(submission.distanceMeters-measured.initialDistance)/measured.initialDistance;
    }
    return clean(result);
  }
  function clean(value) {
    if(!value||!['easy','medium','hard'].includes(value.mode)||!['solo','multiplayer'].includes(value.kind)||
      !Number.isInteger(value.day)||value.day<0||!Number.isInteger(value.points)||value.points<0||value.points>1000)return null;
    const result={day:value.day,mode:value.mode,kind:value.kind,points:value.points};
    if(finite(value.relativeError)&&value.relativeError>=0&&value.relativeError<=1e12)result.relativeError=value.relativeError;
    if(finite(value.angleError)&&value.angleError>=-180&&value.angleError<180)result.angleError=value.angleError;
    if(value.mode==='hard'&&finite(value.distanceError)&&value.distanceError>=-100&&value.distanceError<=1e12)result.distanceError=value.distanceError;
    return result;
  }
  function select(values,{mode='all',days=0,now=Date.now()}={}) {
    const minimum=days?Math.floor(now/DAY)-days+1:-Infinity;
    return Object.values(values||{}).map(clean).filter(value=>value&&value.day>=minimum&&(mode==='all'||value.mode===mode));
  }
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  function summarize(values) {
    const samples=select(values),angles=samples.filter(s=>finite(s.angleError)).map(s=>s.angleError);
    const distances=samples.filter(s=>finite(s.distanceError)).map(s=>s.distanceError);
    const x=angles.reduce((sum,a)=>sum+Math.cos(a*Math.PI/180),0),y=angles.reduce((sum,a)=>sum+Math.sin(a*Math.PI/180),0);
    return {count:samples.length,relativeError:mean(samples.filter(s=>finite(s.relativeError)).map(s=>s.relativeError)),
      absoluteAngle:mean(angles.map(Math.abs)),angleBias:angles.length&&Math.hypot(x,y)/angles.length>=1e-6?((Math.atan2(y,x)*180/Math.PI+540)%360)-180:null,
      absoluteDistance:mean(distances.map(Math.abs)),distanceBias:mean(distances),
      angleSamples:angles.map(error=>({error})),distanceSamples:distances.map(error=>({error}))};
  }
  const compareShots=(a,b)=>b.points-a.points||(a.relativeError??Infinity)-(b.relativeError??Infinity)||Math.abs(a.angleError??180)-Math.abs(b.angleError??180)||b.day-a.day;
  function bestShotEntries(values){return Object.entries(values||{}).map(([id,value])=>{const row=clean(value);return row?.mode==='hard'?{id,...row}:null;}).filter(Boolean).sort(compareShots).slice(0,3);}
  function bestShots(values){return bestShotEntries(values).map(({id,...row})=>row);}
  function shotGeometry(detail){
    const a=detail?.submission,t=detail?.target;
    if(!a||!t||![a.lat,a.lon,a.heading,a.distanceMeters,t.lat,t.lon].every(finite)||Math.abs(a.lat)>90||Math.abs(t.lat)>90||Math.abs(a.lon)>180||Math.abs(t.lon)>180||a.heading<0||a.heading>=360||a.distanceMeters<0||a.distanceMeters>100000000||typeof t.label!=='string'||!t.label.trim()||t.label.length>300)return null;
    return {submission:{lat:a.lat,lon:a.lon,heading:a.heading,distanceMeters:a.distanceMeters},target:{lat:t.lat,lon:t.lon,label:t.label}};
  }
  const api={sample,clean,select,summarize,bestShots,bestShotEntries,shotGeometry,compareShots};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BussoleAccountStatistics=api;
})(typeof window==='object'?window:globalThis);
