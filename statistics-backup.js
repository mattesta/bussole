import {saveLocalSamples} from './local-statistics.js?v=1';
import {saveHighlight} from './private-geometry.js?v=1';

export const MAX_BACKUP_BYTES=10*1024*1024;
const invalid=()=>Error('Choose a valid Bussole data export. Nothing has been imported.');
const fingerprint=row=>JSON.stringify(row);
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function sample(value){
 const clean=window.BussoleAccountStatistics.clean(value);
 if(!clean||['relativeError','angleError','distanceError'].some(key=>Object.hasOwn(value,key)&&value[key]!==clean[key]))throw invalid();
 return clean;
}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);

// Parse/validate/preview only. No storage mutations or network calls.
export async function prepareBackup(text,{uid,email,generation,existing={},cloudShots={}}){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw Error('Choose a JSON export smaller than 10 MB.');
 let backup;try{backup=JSON.parse(text);}catch{throw invalid();}
 if(!backup||![1,2].includes(backup.version)||!Array.isArray(backup.samples)||backup.samples.length>50000||!Array.isArray(backup.privateProShots||[])||(backup.privateProShots||[]).length>3)throw invalid();
 if(backup.version===2){if(backup.app!=='bussole'||backup.accountId!==uid)throw Error('This backup belongs to a different Bussole account. Sign in to the original account.');}
 else if(typeof backup.email!=='string'||backup.email.trim().toLowerCase()!==email?.trim().toLowerCase())throw Error('This older backup needs the same account email. Use a new export if your email has changed.');
 const samples=Object.create(null),seen=new Map(),existingCounts=new Map(),legacyCredits=new Map(),idsByValue=new Map(),fileIds=new Set();
 for(const [id,row] of Object.entries(existing)){
  const clean=sample(row),fp=fingerprint(clean);existingCounts.set(fp,(existingCounts.get(fp)||0)+1);
  if(id.startsWith('legacy-import-'))legacyCredits.set(fp,(legacyCredits.get(fp)||0)+1);
  if(!idsByValue.has(fp))idsByValue.set(fp,id);
 }
 for(const row of backup.samples){
  const clean=sample(row),fp=fingerprint(clean),occurrence=(seen.get(fp)||0)+1;seen.set(fp,occurrence);
  let id;
  if(backup.version===2){
   id=row.id;if(!validId(id)||fileIds.has(id))throw invalid();fileIds.add(id);
   if(Object.hasOwn(existing,id)){if(fingerprint(sample(existing[id]))!==fp)throw Error('A backup record conflicts with a record on this device. Nothing has been imported.');continue;}
   if((legacyCredits.get(fp)||0)>0){legacyCredits.set(fp,legacyCredits.get(fp)-1);continue;}
  }else{
   if(occurrence<=(existingCounts.get(fp)||0))continue;
   id=`legacy-import-${await digest(fp)}-${occurrence}`;
  }
  samples[id]={...clean,generation};if(!idsByValue.has(fp))idsByValue.set(fp,id);
 }
 const shots=[];
 for(const row of backup.privateProShots||[]){
  const clean=sample(row),geometry=window.BussoleAccountStatistics.shotGeometry(row);
  if(clean.mode!=='hard'||!geometry)throw invalid();
  let id=row.sampleId;
  if(backup.version===2&&!validId(id))throw invalid();
  if(backup.version===1){
   const matches=Object.values(cloudShots).filter(s=>s.points===clean.points&&s.destination===geometry.target.label);
   id=matches.length===1?matches[0].sampleId:idsByValue.get(fingerprint(clean))||`legacy-shot-${await digest(fingerprint({...clean,...geometry}))}`;
  }
  shots.push({...clean,...geometry,sampleId:id,generation});
 }
 return {uid,generation,samples,shots,total:backup.samples.length,added:Object.keys(samples).length,duplicates:backup.samples.length-Object.keys(samples).length};
}

// Device stores only. Cloud records, rankings, Daily attempts and friend snapshots are not imported.
export async function restoreBackup(plan){
 await saveLocalSamples(plan.uid,plan.generation,plan.samples);
 let replayStorageFailed=false;
 for(const shot of plan.shots)if(!saveHighlight(plan.uid,plan.generation,shot))replayStorageFailed=true;
 return {added:plan.added,replayStorageFailed};
}
