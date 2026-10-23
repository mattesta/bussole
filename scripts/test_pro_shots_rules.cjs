for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[key];
const fs=require('node:fs'),assert=require('node:assert/strict'),{initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing'),{ref,get,set,update}=require('firebase/database');
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});try{
 const db=uid=>env.authenticatedContext(uid,{email_verified:true,firebase:{sign_in_provider:'password'}}).database(),a=db('shot-owner'),b=db('shot-friend'),c=db('shot-stranger'),generation='12345678-1234-1234-1234-123456789012',day=Math.floor(Date.now()/86400000),id='12345678-1234-1234-1234-123456789abc';
 const profile={username:'',useInRooms:false,generation,socialEnabled:true};
 for(const [uid,database] of [['shot-owner',a],['shot-friend',b]])await ok(set(ref(database,`accountData/${uid}/profile`),profile));
 const shot={points:999,generation,sampleId:id,destination:'Venice'};
 await ok(set(ref(a,'accountData/shot-owner/proShots/0'),shot));
 await no(get(ref(b,'accountData/shot-owner/proShots')));await no(get(ref(c,'accountData/shot-owner')));
 for(const extra of [{submission:{lat:48,lon:11,heading:90,distanceMeters:42}},{target:{lat:45,lon:12,label:'Venice'}},{lat:48},{angleError:12},{relativeError:34},{distanceError:-7},{day:day},{route:[[1,2],[3,4]]}])await no(set(ref(a,'accountData/shot-owner/proShots/0'),{...shot,...extra}));
 await no(set(ref(a,'accountData/shot-owner/proShots'),Object.fromEntries([0,1,2,3].map(n=>[n,shot]))));
 await ok(update(ref(a),{'accountData/shot-owner/proShots':null,'accountData/shot-owner/samples':null,'accountData/shot-owner/profile/generation':'22345678-1234-1234-1234-123456789012'}));
 await no(set(ref(a,'accountData/shot-owner/proShots/0'),shot));
 console.log('Pro highlight rules: scalar metadata only, raw geometry rejected even for owner, bounded top three, owner isolation and stale-generation rejection passed.');
}finally{await env.cleanup();}})().catch(error=>{console.error(error);process.exitCode=1});
