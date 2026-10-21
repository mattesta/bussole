for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[k];
const fs=require('node:fs'),assert=require('node:assert/strict'),{initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=require('@firebase/rules-unit-testing'),{ref,get,set,update}=require('firebase/database');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});
 try{
 const db=(uid,provider='password',verified=true)=>env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:verified,firebase:{sign_in_provider:provider}}).database();
 const a=db('social-a'),b=db('social-b','google.com'),c=db('social-c'),pending=db('social-pending','google.com',false),guest=db('social-guest','anonymous',false),day=Math.floor(Date.now()/86400000),generation='12345678-1234-1234-1234-123456789012';
 const profile={username:'Explorer',useInRooms:false,communityConsent:false,consentVersion:1,leaderboardOptIn:false,socialEnabled:true,generation};
 for(const [id,database] of [['social-a',a],['social-b',b],['social-c',c]]){await ok(set(ref(database,`accountData/${id}/profile`),profile));await ok(set(ref(database,`publicProfiles/${id}`),{name:id.replace('-','_')}));}
 const share={generation,journey:{asOfDay:day,tenths:5000,lastDay:day},samples:[{day,mode:'hard',kind:'solo',points:700,relativeError:20,angleError:-5,distanceError:10}],bests:[]};
 await ok(set(ref(a,'friendShares/social-a'),share));await ok(set(ref(b,'friendShares/social-b'),share));
 await no(get(ref(a,'friendShares/social-b')));await no(get(ref(c,'friendShares/social-a')));await no(get(ref(guest,'publicProfiles/social-a')));await no(get(ref(a,'publicProfiles')));await no(set(ref(pending,'publicProfiles/social-pending'),{name:'Pending'}));
 await no(set(ref(a,'publicProfiles/social-a'),{name:'Explorer',email:'private@example.test'}));await no(set(ref(a,'friendShares/social-a'),{...share,lat:42}));await no(set(ref(a,'friendShares/social-a'),{...share,samples:[{...share.samples[0],target:'secret'}]}));
 const pair=value=>({'connections/social-a/social-b':value,'connections/social-b/social-a':value});
 const request={state:'pending',requestedBy:'social-a'};await ok(update(ref(a),pair(request)));await no(get(ref(c,'connections/social-a')));await no(get(ref(a,'friendShares/social-b')));
 const accepted={state:'accepted',requestedBy:'social-a'};await no(update(ref(a),pair(accepted)));await no(update(ref(c),pair(accepted)));await no(set(ref(b,'connections/social-b/social-a'),accepted));await ok(update(ref(b),pair(accepted)));
 await ok(get(ref(a,'friendShares/social-b')));await ok(get(ref(b,'friendShares/social-a')));await no(get(ref(a,'accountData/social-b')));await no(get(ref(a,'accountData/social-b/samples')));await no(get(ref(c,'friendShares/social-b')));
 const board={...share.journey,name:'Explorer',generation};await no(set(ref(a,'journeyLeaderboard/social-a'),board));await ok(update(ref(a,'accountData/social-a/profile'),{leaderboardOptIn:true}));await ok(set(ref(a,'journeyLeaderboard/social-a'),board));await ok(get(ref(b,'journeyLeaderboard')));await no(get(ref(guest,'journeyLeaderboard')));await no(get(ref(pending,'journeyLeaderboard')));await no(set(ref(b,'journeyLeaderboard/social-a'),board));
 for(const extra of [{email:'secret'},{lat:42},{tenths:-1},{tenths:1.1},{lastDay:day+1},{asOfDay:day-1}])await no(set(ref(a,'journeyLeaderboard/social-a'),{...board,...extra}));
 // Opt-out and erasure are atomic; stale snapshots cannot restore either publication.
 await ok(update(ref(a),{'accountData/social-a/profile/leaderboardOptIn':false,'journeyLeaderboard/social-a':null}));await no(set(ref(a,'journeyLeaderboard/social-a'),board));
 await ok(update(ref(a),{'accountData/social-a/profile/generation':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','friendShares/social-a':null}));await no(set(ref(a,'friendShares/social-a'),share));
 await ok(update(ref(b),pair(null)));await no(get(ref(a,'friendShares/social-b')));await no(get(ref(b,'friendShares/social-a')));
 await no(update(ref(a),pair(accepted)));await no(set(ref(a,'connections/social-a/social-c'),{state:'pending',requestedBy:'social-a'}));
 console.log('Social rules passed: Google ownership, private email/data isolation, mutual recipient-only acceptance, pending/stranger denial, revocation, safe fields, opt-in board, atomic opt-out and stale-generation barriers.');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
