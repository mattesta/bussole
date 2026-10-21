for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[k];
const fs=require('node:fs'),assert=require('node:assert/strict'),{initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing'),{ref,get,set,update}=require('firebase/database');
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});try{
 const db=(uid,verified=true)=>env.authenticatedContext(uid,{email_verified:verified,firebase:{sign_in_provider:'password'}}).database(),a=db('name-a'),b=db('name-b'),pending=db('name-pending',false);
 const profile={username:'',useInRooms:false,communityConsent:false,consentVersion:1,generation:'12345678-1234-1234-1234-123456789012'};
 for(const [uid,database] of [['name-a',a],['name-b',b],['name-pending',pending]])await ok(set(ref(database,`accountData/${uid}/profile`),profile));
 const claim=(database,uid,name)=>update(ref(database),{[`accountData/${uid}/profile/username`]:name,[`usernames/${name.toLowerCase()}`]:uid});
 await no(set(ref(a,'accountData/name-a/profile/username'),'Marco'));await no(set(ref(a,'usernames/stray'),'name-a'));await no(claim(pending,'name-pending','Pending'));
 const claims=await Promise.allSettled([claim(a,'name-a','Marco'),claim(b,'name-b','mArCo')]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
 const owner=(await get(ref(a,'usernames/marco'))).val(),ownerDB=owner==='name-a'?a:b,other=owner==='name-a'?b:a;
 await no(set(ref(other,'usernames/marco'),owner==='name-a'?'name-b':'name-a'));await no(set(ref(other,'usernames/marco'),null));await no(get(ref(a,'usernames')));await no(get(ref(pending,'usernames/marco')));
 await no(set(ref(ownerDB,'usernames/marco'),null));await no(claim(ownerDB,owner,'Polo'));
 await ok(update(ref(ownerDB),{[`accountData/${owner}/profile/username`]:'Polo','usernames/polo':owner,'usernames/marco':null}));assert.equal((await get(ref(a,'usernames/marco'))).exists(),false);
 await ok(claim(other,owner==='name-a'?'name-b':'name-a','Marco'));
 await ok(update(ref(ownerDB),{[`accountData/${owner}`]:null,'usernames/polo':null}));assert.equal((await get(ref(a,'usernames/polo'))).exists(),false);
 // Legacy display names survive without silent renames, but are not searchable until saved/claimed.
 await env.withSecurityRulesDisabled(async context=>set(ref(context.database(),'accountData/legacy/profile'),{...profile,username:'OldName'}));
 const legacy=db('legacy');await ok(update(ref(legacy,'accountData/legacy/profile'),{useInRooms:true}));await ok(claim(legacy,'legacy','OldName'));
 console.log('Username rules: case-insensitive atomic race, no stealing/hoarding, exact lookup only, verified claims, rename/release, deletion and legacy migration passed.');
}finally{await env.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1});
