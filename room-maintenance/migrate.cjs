// Owner-run, one-time migration. Defaults to a count-only dry run.
// Uses Application Default Credentials; never commit or send credentials in chat.
const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const DB='https://bussole-game-default-rtdb.europe-west1.firebasedatabase.app';
function metadata(shot){const {submission,target,...rest}=shot;return {...rest,destination:shot.destination||target?.label||'Destination not saved'};}
async function migrate(db,{apply=false}={}){
 let legacyRooms=0,highlights=0;
 const rooms=(await db.ref('rooms').get()).val()||{};
 for(const [code,room] of Object.entries(rooms)){
  if(room.meta?.schemaVersion===2)continue;
  legacyRooms++;
  if(apply){
   // Old clients cannot join v2 rooms. Close and erase old room geometry/history.
   const result=await db.ref(`rooms/${code}`).transaction(current=>!current?null:current.meta?.schemaVersion!==2?null:undefined);
   if(result.committed)await db.ref(`publicRooms/${code}`).remove();
  }
 }
 const accounts=(await db.ref('accountData').get()).val()||{};
 for(const [uid,account] of Object.entries(accounts))for(const [slot,shot] of Object.entries(account.proShots||{})){
  if(!shot.submission&&!shot.target)continue;
  highlights++;
  if(apply)await db.ref(`accountData/${uid}/proShots/${slot}`).transaction(current=>!current?null:(current.submission||current.target)?metadata(current):undefined);
 }
 console.log(`${apply?'Applied':'Dry run'}: ${legacyRooms} legacy rooms, ${highlights} legacy highlights. No coordinates or player identifiers logged.`);
 return {legacyRooms,highlights};
}
if(require.main===module){initializeApp({databaseURL:DB});migrate(getDatabase(),{apply:process.argv.includes('--apply')}).then(()=>process.exit(0)).catch(()=>{console.error('Migration failed. Check owner credentials and database access. No private data logged.');process.exitCode=1;});}
module.exports={migrate,metadata};
