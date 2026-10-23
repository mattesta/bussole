for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])delete process.env[key];
const fs=require('node:fs'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails:no}=require('@firebase/rules-unit-testing'),{ref,get,set,update}=require('firebase/database');
const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getDatabase}=require('firebase-admin/database');
const {run}=require('../room-maintenance/cleanup.cjs'),{migrate}=require('../room-maintenance/migrate.cjs');
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-bussole',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}}),app=initializeApp({projectId:'demo-bussole',databaseURL:'https://demo-bussole.firebaseio.com'},'maintenance');try{
 const now=Date.now(),password='TestsOnlyStrong123!',email='room-cleaner@example.test',bot=await getAuth(app).createUser({email,password}),db=getDatabase(app);
 const raw={lat:48,lon:11,heading:90,distanceMeters:10000};
 await db.ref().set({roomMaintenanceConfig:{uid:bot.uid},rooms:{OLDOLD:{meta:{phase:'closed'},submissions:{1:{owner:raw}}},EXPIRE:{meta:{schemaVersion:2,createdAt:now-172800000,expiresAt:now-86400000}},ACTIVE:{meta:{schemaVersion:2,createdAt:now,expiresAt:now+86400000}}},publicRooms:{OLDOLD:{updatedAt:now-86400000},EXPIRE:{updatedAt:now-86400000}},roomExpirations:{EXPIRE:{createdAt:now-172800000,expiresAt:now-86400000},ACTIVE:{createdAt:now,expiresAt:now+86400000}},communityStatistics:{mean:12},accountInternal:{legacy:true},friendShares:{owner:{samples:{old:{angleError:10}},proShots:[{points:999,destination:'Target'}]}},accountData:{owner:{profile:{generation:'g',communityConsent:true,consentVersion:1},samples:{old:{generation:'g',angleError:10}},proShots:{0:{sampleId:'12345678-1234-1234-1234-123456789abc',generation:'g',angleError:10,relativeError:20,points:999,submission:raw,target:{lat:20,lon:30,label:'Target'}}}}}});
 assert.deepEqual(await migrate(db),{legacyRooms:1,highlights:1,statisticsAccounts:1,sharedHistories:1});assert.equal((await db.ref('rooms/OLDOLD').get()).exists(),true);
 assert.deepEqual(await migrate(db,{apply:true}),{legacyRooms:1,highlights:1,statisticsAccounts:1,sharedHistories:1});assert.equal((await db.ref('rooms/OLDOLD').get()).exists(),false);
 assert.deepEqual((await db.ref('accountData/owner/proShots/0').get()).val(),{sampleId:'12345678-1234-1234-1234-123456789abc',generation:'g',points:999,destination:'Target'});
 for(const path of ['accountData/owner/samples','accountData/owner/profile/communityConsent','accountData/owner/profile/consentVersion','friendShares/owner/samples','communityStatistics','accountInternal'])assert.equal((await db.ref(path).get()).exists(),false,path);
 assert.equal((await db.ref('friendShares/owner/proShots/0/points').get()).val(),999);
 assert.deepEqual(await migrate(db,{apply:true}),{legacyRooms:0,highlights:0,statisticsAccounts:0,sharedHistories:0});
 const request=(input,options)=>{const url=new URL(input);if(url.hostname==='identitytoolkit.googleapis.com')return fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com${url.pathname}${url.search}`,options);url.protocol='http:';url.host='127.0.0.1:9000';url.searchParams.set('ns','demo-bussole');return fetch(url,options)};
 const secret=JSON.stringify({email,password});assert.deepEqual(await run({request,secret,now}),{removed:1});
 assert.equal((await db.ref('rooms/EXPIRE').get()).exists(),false);assert.equal((await db.ref('rooms/ACTIVE').get()).exists(),true);
 assert.equal((await db.ref('publicRooms/EXPIRE').get()).exists(),false);assert.equal((await db.ref('roomExpirations/EXPIRE').get()).exists(),false);
 assert.deepEqual(await run({request,secret,now}),{removed:0});
 // A stale expiry entry must not grant deletion of a live room.
 await db.ref('roomExpirations/ACTIVE/expiresAt').set(now-1);
 await assert.rejects(run({request,secret,now}),{cleanupCode:'ROOM_DELETE_DENIED'});assert.equal((await db.ref('rooms/ACTIVE').get()).exists(),true);
 console.log('Maintenance: real password auth/REST, expired-only deletion, stale-index safety, dry run, transactional legacy purge, metadata preservation and idempotence passed.');
}finally{await env.cleanup();await app.delete();}})().catch(e=>{console.error(e);process.exitCode=1});
