for(const key of ['HTTP_PROXY','http_proxy','HTTPS_PROXY','https_proxy'])delete process.env[key];
const assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing');
const {get,set,update,ref}=require('firebase/database');
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});try{
 const db=(uid,verified=true,provider='password')=>env.authenticatedContext(uid,{email_verified:verified,email:`${uid}@example.test`,firebase:{sign_in_provider:provider}}).database();
 const owner=db('owner'),other=db('other'),guest=db('guest',false,'anonymous'),pending=db('pending',false);
 const profile={username:'Marco_Polo',useInRooms:true,generation:'12345678-1234-1234-1234-123456789012'},p='accountData/owner',key='12345678-1234-1234-1234-123456789abc';
 await ok(update(ref(owner),{[`${p}/profile`]:profile,'usernames/marco_polo':'owner'}));
 await ok(get(ref(owner,p)));await no(get(ref(other,p)));await no(get(ref(guest,p)));await no(get(ref(env.unauthenticatedContext().database(),p)));await no(get(ref(owner,'accountData')));
 await no(set(ref(other,p),null));await no(set(ref(guest,'accountData/guest/profile'),profile));await ok(set(ref(pending,'accountData/pending/profile'),{...profile,username:''}));
 for(const value of [{day:20000,mode:'hard',kind:'solo',points:800,generation:profile.generation,angleError:20,relativeError:10,distanceError:-30},{points:800},{angleError:20},{bucket:'coarse'}])await no(set(ref(owner,`${p}/samples/${key}`),value));
 for(const field of ['angleError','distanceError','relativeError','communityConsent','consentVersion','email'])await no(set(ref(owner,`${p}/profile/${field}`),field==='communityConsent'?false:1));
 const best={mode:'medium',timerSeconds:0,blurEnabled:false,score:3100,rounds:5,day:Math.floor(Date.now()/86400000),generation:profile.generation},bestPath=`${p}/soloBests/medium-t0-b0`;
 await ok(set(ref(owner,bestPath),best));await no(get(ref(other,bestPath)));await no(set(ref(pending,'accountData/pending/soloBests/medium-t0-b0'),best));
 for(const invalid of [{score:5001},{rounds:4},{score:2999},{timerSeconds:2},{target:'Private place'},{lat:42},{angleError:20}])await no(set(ref(owner,bestPath),{...best,...invalid}));
 await ok(set(ref(owner,bestPath),{...best,score:3200}));
 await ok(update(ref(owner,p),{samples:null,soloBests:null,'profile/generation':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}));await no(set(ref(owner,bestPath),best));
 await no(get(ref(owner,'communityStatistics')));await no(set(ref(owner,'communityStatistics/all'),{available:true,count:1}));await no(get(ref(owner,'accountInternal')));
 // Owner-only legacy migration remains possible; no client can recreate the source.
 await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),`${p}/samples/${key}`),{angleError:12,relativeError:45}));
 await ok(get(ref(owner,`${p}/samples`)));await ok(set(ref(owner,`${p}/samples`),null));await no(set(ref(owner,`${p}/samples/${key}`),{angleError:12,relativeError:45}));
 await ok(set(ref(owner,p),null));
 console.log('Account rules: minimal profile, no cloud sample uploads, no community reads, owner migration/erasure, best-score validation and generation barriers passed.');
}finally{await env.cleanup();}})().catch(error=>{console.error(error);process.exitCode=1});
