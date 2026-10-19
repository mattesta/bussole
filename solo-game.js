// A five-round game is distinct from open-ended practice. Geometry stays in the globe.
(function(root){
 const ROUNDS=5,modes=['easy','medium','hard'];
 function settings(value={}){
  const seconds=Number(value.timerSeconds)||0;
  return {mode:modes.includes(value.mode)?value.mode:'medium',timerSeconds:Number.isInteger(seconds)&&seconds>=3&&seconds<=60?seconds:0,blurEnabled:Boolean(value.blurEnabled)};
 }
 const key=value=>{const s=settings(value);return `${s.mode}-t${s.timerSeconds}-b${s.blurEnabled?1:0}`;};
 function targets(catalogue,random=Math.random){
  const seen=new Set();let pool=(catalogue||[]).filter(place=>{
   if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return false;
   const id=`${place.lat},${place.lon}`;if(seen.has(id))return false;seen.add(id);return true;
  });
  if(pool.length<ROUNDS)throw new Error('The random target catalogue could not be loaded. Return Home and retry.');
  const picked=[];
  while(picked.length<ROUNDS){
   const roll=random(),category=roll<.35?'capital':roll<.7?'city':'landmark';
   const candidates=pool.filter(place=>place.category===category),choices=candidates.length?candidates:pool;
   const total=choices.reduce((sum,place)=>sum+(place.weight||1),0);let ticket=random()*total;
   const place=choices.find(place=>(ticket-=place.weight||1)<=0)||choices.at(-1);
   picked.push({lat:place.lat,lon:place.lon,label:place.country?`${place.name}, ${place.country}`:place.name});
   pool=pool.filter(candidate=>candidate!==place);
  }
  return picked;
 }
 function create(catalogue,options,random){
  const config=settings(options),deck=targets(catalogue,random),rounds=[];let phase='aiming';
  return {
   settings:config,
   get phase(){return phase;},get round(){return rounds.length+(phase==='aiming'?1:0);},get total(){return rounds.reduce((sum,round)=>sum+round.points,0);},
   get target(){return {...deck[phase==='aiming'?rounds.length:rounds.length-1]};},
   get results(){return rounds.map(round=>({...round,target:{...round.target},submission:round.submission?{...round.submission}:null}));},
   finish(submission,points,errorMeters=null){
    if(phase!=='aiming')return false;
    if(!Number.isInteger(points)||points<0||points>1000)throw new Error('Invalid round score.');
    rounds.push({round:rounds.length+1,target:{...deck[rounds.length]},submission:submission?{...submission}:null,points,errorMeters,mode:config.mode});
    phase=rounds.length===ROUNDS?'finished':'revealed';return true;
   },
   next(){if(phase!=='revealed')return false;phase='aiming';return true;}
  };
 }
 root.BussoleSoloGame={ROUNDS,settings,key,create};
})(window);
