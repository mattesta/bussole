// Aggregate scalars only. No player-level contributions are published or retained here.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function aggregate(accounts,minimumContributors=5){
  const output={};
  for(const mode of ['all','easy','medium','hard']){
    let contributors=0,count=0,relativeTotal=0,relativeCount=0,angleTotal=0,angleCount=0,distanceTotal=0,distanceCount=0;
    let relativeContributors=0,angleContributors=0,distanceContributors=0;
    for(const account of Object.values(accounts||{})){
      if(account?.profile?.communityConsent!==true||account.profile.consentVersion!==1)continue;
      const samples=Object.values(account.samples||{}).filter(sample=>sample&&sample.generation===account.profile.generation&&['easy','medium','hard'].includes(sample.mode)&&(mode==='all'||sample.mode===mode));
      if(!samples.length)continue;contributors++;count+=samples.length;
      if(samples.some(sample=>finite(sample.relativeError)))relativeContributors++;
      if(samples.some(sample=>finite(sample.angleError)))angleContributors++;
      if(samples.some(sample=>sample.mode==='hard'&&finite(sample.distanceError)))distanceContributors++;
      for(const sample of samples){
        if(finite(sample.relativeError)){relativeTotal+=sample.relativeError;relativeCount++;}
        if(finite(sample.angleError)){angleTotal+=Math.abs(sample.angleError);angleCount++;}
        if(sample.mode==='hard'&&finite(sample.distanceError)){distanceTotal+=Math.abs(sample.distanceError);distanceCount++;}
      }
    }
    output[mode]=contributors>=minimumContributors?{available:true,contributors,count,relativeError:relativeContributors>=minimumContributors?relativeTotal/relativeCount:null,absoluteAngle:angleContributors>=minimumContributors?angleTotal/angleCount:null,absoluteDistance:distanceContributors>=minimumContributors?distanceTotal/distanceCount:null}:{available:false};
  }
  return output;
}
module.exports={aggregate};
