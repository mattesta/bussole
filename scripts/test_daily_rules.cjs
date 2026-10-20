const fs=require('node:fs'),assert=require('node:assert/strict');
for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[key];
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,runTransaction,serverTimestamp}=require('firebase/database');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});
 try{
  const owner=env.authenticatedContext('daily-owner',{email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'password'}}).database();
  const other=env.authenticatedContext('daily-other',{email_verified:true,firebase:{sign_in_provider:'password'}}).database();
  const pending=env.authenticatedContext('pending',{email_verified:false,firebase:{sign_in_provider:'password'}}).database(),guest=env.unauthenticatedContext().database();
  const day=Math.floor(Date.now()/86400000),p='accountData/daily-owner',key='12345678-1234-1234-1234-123456789012',generation='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const profile={username:'',useInRooms:false,communityConsent:false,consentVersion:1,generation};
  await ok(set(ref(owner,`${p}/profile`),profile));
  const attempt={entryKey:key,generation,startedAt:serverTimestamp(),version:1},a=`${p}/dailyAttempts/${day}`,score=`dailyScores/${day}/${key}`;
  await no(set(ref(pending,`accountData/pending/dailyAttempts/${day}`),attempt));await no(set(ref(other,a),attempt));
  await no(set(ref(owner,`${p}/dailyAttempts/${day-1}`),attempt));await no(set(ref(owner,`${p}/dailyAttempts/${day+1}`),attempt));
  await no(set(ref(owner,a),{...attempt,score:1000}));await no(set(ref(owner,a),{...attempt,lat:42}));await no(set(ref(owner,a),{...attempt,startedAt:Date.now()-10000}));
  const secondDevice=env.authenticatedContext('daily-owner',{email_verified:true,firebase:{sign_in_provider:'password'}}).database();
  const reserve=(database)=>runTransaction(ref(database,a),old=>old?undefined:attempt);
  const claims=await Promise.all([reserve(owner),reserve(secondDevice)]);assert.equal(claims.filter(c=>c.committed).length,1);
  const value=(await get(ref(owner,a))).val();await no(get(ref(other,a)));await no(get(ref(guest,a)));
  await no(set(ref(owner,score),3000));await no(set(ref(owner,a),{...value,entryKey:'99999999-1234-1234-1234-123456789012'}));
  await no(set(ref(owner,a),{...value,score:5001}));await no(set(ref(owner,a),{...value,score:1.5}));
  await ok(set(ref(owner,a),{...value,score:3000}));await no(set(ref(owner,a),{...value,score:4000}));
  await no(set(ref(owner,score),4000));await ok(set(ref(owner,score),3000));await ok(set(ref(owner,score),3000));
  await ok(get(ref(guest,`dailyScores/${day}`)));assert.equal((await get(ref(guest,score))).val(),3000);
  await no(get(ref(guest,'dailyScores')));await no(set(ref(other,score),3000));await no(set(ref(other,score),null));await no(set(ref(guest,score),null));
  await ok(update(ref(owner),{[a]:null,[score]:null,[`${p}/profile/generation`]:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'}));
  await no(set(ref(owner,score),3000));await no(set(ref(owner,a),{...value,score:3000}));assert.equal((await get(ref(guest,score))).exists(),false);
  await ok(set(ref(owner,`${p}/dailyAttempts/${day}`),{...attempt,generation:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'}));
  const newValue=(await get(ref(owner,a))).val();await ok(set(ref(owner,a),{...newValue,score:0}));await ok(set(ref(owner,score),0));
  const previousDay=day-1,oldPath=`${p}/dailyAttempts/${previousDay}`;
  await env.withSecurityRulesDisabled(async context=>set(ref(context.database(),oldPath),{...newValue,startedAt:(day-1)*86400000}));
  const oldAttempt=(await get(ref(owner,oldPath))).val();await ok(set(ref(owner,oldPath),{...oldAttempt,score:800}));await ok(set(ref(owner,`dailyScores/${previousDay}/${key}`),800));
  await ok(update(ref(owner),{[p]:null,[score]:null,[`dailyScores/${previousDay}/${key}`]:null}));await no(set(ref(owner,score),0));
  console.log('Daily rules: UTC/day and verified owner checks, atomic single reservation, immutable bounded completion, scalar-only shared scores, private identity mapping, cross-account isolation, atomic erasure and stale-game rejection passed.');
 }finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1});
