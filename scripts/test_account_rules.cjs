for(const key of ['HTTP_PROXY','http_proxy','HTTPS_PROXY','https_proxy'])delete process.env[key];
const assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing');
const {get,set,update,ref}=require('firebase/database');
(async()=>{
 const [host,port]=process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host,port:Number(port),rules:fs.readFileSync('database.rules.json','utf8')}});
 try{
  const db=(uid,verified=true,provider='password')=>env.authenticatedContext(uid,{email_verified:verified,email:`${uid}@example.test`,firebase:{sign_in_provider:provider}}).database();
  const owner=db('owner'),other=db('other'),guest=db('guest',false,'anonymous'),unverified=db('pending',false);
  const profile={username:'Marco_Polo',useInRooms:true,communityConsent:false,consentVersion:1,generation:'12345678-1234-1234-1234-123456789012'};
  const sample={day:Math.floor(Date.now()/86400000),mode:'hard',kind:'multiplayer',points:800,relativeError:10,angleError:-20,distanceError:-30,generation:profile.generation};
  const p='accountData/owner',key='12345678-1234-1234-1234-123456789abc';
  await ok(update(ref(owner),{[`${p}/profile`]:profile,'usernames/marco_polo':'owner'}));await ok(set(ref(owner,`${p}/samples/${key}`),sample));
  await ok(get(ref(owner,p)));await no(get(ref(other,p)));await no(get(ref(guest,p)));await no(get(ref(env.unauthenticatedContext().database(),p)));
  await no(get(ref(owner,'accountData')));await no(set(ref(other,p),null));await no(set(ref(guest,'accountData/guest/profile'),profile));
  await ok(set(ref(unverified,'accountData/pending/profile'),{...profile,username:''}));await no(set(ref(unverified,`accountData/pending/samples/${key}`),sample));
  await no(update(ref(unverified,'accountData/pending/profile'),{communityConsent:true}));
  await no(update(ref(owner,`${p}/profile`),{email:'hidden@example.test'}));
  for(const extra of [{lat:42},{target:'private target'},{heading:100},{roomCode:'ABCDEF'},{round:2},{angleError:181},{distanceError:-101},{relativeError:-1},{points:1001},{kind:'bad'}])await no(set(ref(owner,`${p}/samples/${key}`),{...sample,...extra}));
  await no(set(ref(owner,`${p}/samples/${key}`),{...sample,mode:'easy',distanceError:10}));
  await ok(update(ref(owner,`${p}/profile`),{communityConsent:true}));
  const best={mode:'medium',timerSeconds:0,blurEnabled:false,score:3100,rounds:5,day:sample.day,generation:profile.generation};
  const bestPath=`${p}/soloBests/medium-t0-b0`;
  await ok(set(ref(owner,bestPath),best));await no(get(ref(other,bestPath)));
  await no(set(ref(unverified,'accountData/pending/soloBests/medium-t0-b0'),best));
  for(const invalid of [{score:5001},{rounds:4},{score:2999},{timerSeconds:2},{target:'Private place'},{lat:42}])await no(set(ref(owner,bestPath),{...best,...invalid}));
  await no(set(ref(owner,`${p}/soloBests/medium-t3-b0`),best));
  await ok(set(ref(owner,bestPath),{...best,score:3200}));
  const nextGeneration='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await ok(update(ref(owner,p),{samples:null,soloBests:null,'profile/generation':nextGeneration,'profile/communityConsent':false}));
  await no(set(ref(owner,bestPath),best));
  await no(set(ref(owner,`${p}/samples/${key}`),sample)); // An old open game cannot restore deleted data.
  await ok(set(ref(owner,`${p}/samples/${key}`),{...sample,generation:nextGeneration}));
  await no(set(ref(owner,'communityStatistics/all'),{available:true,count:1}));await no(get(ref(guest,'communityStatistics')));
  await no(get(ref(unverified,'communityStatistics')));await ok(get(ref(owner,'communityStatistics')));await no(get(ref(owner,'accountInternal')));
  await ok(set(ref(owner,p),null));await no(set(ref(owner,`${p}/samples/${key}`),{...sample,generation:nextGeneration}));
  console.log('Account rules: owner-only data, email verification barrier, no coordinates/targets/extras, metric bounds, stale round rejection after deletion, private aggregate internals and read-only comparisons passed.');
 }finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1});
