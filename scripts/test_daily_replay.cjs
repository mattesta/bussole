const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const values={};global.localStorage={getItem:key=>values[key]||null,setItem:(key,value)=>values[key]=value,removeItem:key=>delete values[key]};global.sessionStorage=global.localStorage;global.location={href:''};
 const api=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('daily-replay.js','utf8')).toString('base64'));
 const report={uid:'solo',publicRoom:true,rounds:Array.from({length:5},(_,i)=>({round:i+1}))};
 assert.equal(api.saveDailyReplay('owner','generation',100,report),true);assert.deepEqual(api.dailyReplay('owner','generation',100),report);assert.equal(api.dailyReplay('other','generation',100),null);assert.equal(api.dailyReplay('owner','reset',100),null);
 api.openReplay(report);assert.equal(location.href,'match-summary.html?return=daily');assert.deepEqual(JSON.parse(values.bussoleMatchReport),report);
 api.openReplay(report,'account');assert.equal(location.href,'match-summary.html?return=account');
 assert.equal(api.dailyReplay('owner','generation',101),null);assert.equal(values['bussole-daily-replay-v1:owner'],undefined);
 api.saveDailyReplay('owner','generation',101,report);api.clearDailyReplay('owner');assert.equal(api.dailyReplay('owner','generation',101),null);
 global.localStorage={setItem(){throw Error('blocked')},getItem(){throw Error('blocked')}};assert.equal(api.saveDailyReplay('owner','generation',101,report),false);assert.equal(api.dailyReplay('owner','generation',101),null);
 global.sessionStorage=global.localStorage;assert.throws(()=>api.openReplay(report),/Allow site storage/);
 console.log('Daily replays: account/generation/day isolation, next-day purge, reset, private navigation and blocked-storage handling passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
