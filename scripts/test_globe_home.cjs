const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
assert.ok(!/leaflet|data-map-style|roomMapStyle|src="app.js/.test(html));
assert.ok(html.includes('src="home.js?v=4"'));
function fixture({noLocation=false,blockedStorage=false}={}) {
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  const elements=new Map(ids.map(id=>[id,{value:'60',checked:false,disabled:false,style:{},classList:{hidden:false,toggle(){},add(){this.hidden=true},remove(){this.hidden=false}},events:{},setAttribute(){},focus(){this.focused=true},addEventListener(type,fn){(this.events[type]||=[]).push(fn)}}]));
  const modes=['easy','medium','hard'].map(mode=>({...elements.get('multiplayerBtn'),dataset:{mode},events:{}}));
  const order=[],storage={};
  const c=vm.createContext({console,URLSearchParams,
    document:{getElementById(id){assert.ok(elements.has(id),`Missing DOM element ${id}`);return elements.get(id)},querySelectorAll(){return modes}},
    DeviceOrientationEvent:{requestPermission(){order.push('orientation');return Promise.resolve('granted')}},
    navigator:noLocation?{}:{geolocation:{getCurrentPosition(ok){order.push('location');ok({coords:{latitude:48.1,longitude:11.6}})}}},
    sessionStorage:{setItem(key,value){if(blockedStorage)throw Error('Blocked');storage[key]=value}},window:{location:{}}
  });
  vm.runInContext(fs.readFileSync('round-timer.js','utf8'),c);
  vm.runInContext(fs.readFileSync('home.js','utf8'),c);
  return {c,e:elements,modes,order,storage};
}
(async()=>{
  assert.ok(!/<select\b/i.test(html));
  assert.ok(html.includes('Pro (guess the distance too)'));
  const menu=fixture();
  menu.e.get('singlePlayerBtn').events.click[0]();
  assert.equal(menu.e.get('homePlayChoice').classList.hidden,true);
  assert.equal(menu.e.get('singlePlayerPanel').classList.hidden,false);
  assert.equal(menu.order.length,0);
  menu.e.get('singlePlayerBack').events.click[0]();
  assert.equal(menu.e.get('homePlayChoice').classList.hidden,false);
  assert.equal(menu.e.get('singlePlayerPanel').classList.hidden,true);
  for(let index=0;index<3;index++) {
    const f=fixture();f.e.get('timerCheckbox').checked=true;f.e.get('timerDuration').value='3';f.e.get('blurCheckbox').checked=true;
    await f.modes[index].events.click[0]();
    const u=new URL(f.c.window.location.href,'https://mattesta.github.io/bussole/');
    assert.equal(u.pathname,'/bussole/globe-prototype.html');assert.equal(u.searchParams.get('mode'),f.modes[index].dataset.mode);
    assert.equal(u.searchParams.get('timer'),'3');assert.equal(u.searchParams.get('blur'),'1');assert.equal(u.searchParams.get('integrated'),'1');
    assert.deepEqual(f.order,['orientation','location']);
    const saved=JSON.parse(f.storage.bussoleGlobeLaunch);
    assert.deepEqual(saved.coordinates,{latitude:48.1,longitude:11.6});assert.equal(saved.orientationGranted,true);assert.ok(saved.acquiredAt>0);
  }
  for(const duration of ['2','61']) {
    const f=fixture();f.e.get('timerCheckbox').checked=true;f.e.get('timerDuration').value=duration;
    await f.modes[0].events.click[0]();assert.equal(f.c.window.location.href,undefined);assert.equal(f.order.length,0);
  }
  for(const id of ['multiplayerBtn','createRoomBtn','createPublicRoomBtn','joinRoomBtn','joinPublicRoomBtn']) {
    const f=fixture();await f.e.get(id).events.click[0]();assert.deepEqual(f.order,['orientation','location']);
  }
  const invite=fixture();
  await invite.e.get('joinRoomBtn').events.click[0]();
  await invite.e.get('joinPublicRoomBtn').events.click[0]();
  assert.deepEqual(invite.order,['orientation','location']); // one permission hand-off per home visit
  const denied=fixture({noLocation:true,blockedStorage:true});
  await denied.modes[0].events.click[0]();assert.ok(denied.c.window.location.href.includes('globe-prototype.html'));
  const retry=fixture();
  retry.c.DeviceOrientationEvent.requestPermission=()=>Promise.resolve('denied');
  await retry.e.get('joinRoomBtn').events.click[0]();
  assert.equal(JSON.parse(retry.storage.bussoleGlobeLaunch).orientationGranted,false);
  retry.c.DeviceOrientationEvent.requestPermission=()=>Promise.resolve('granted');
  await retry.e.get('joinRoomBtn').events.click[0]();
  assert.equal(JSON.parse(retry.storage.bussoleGlobeLaunch).orientationGranted,true);
  console.log('Globe-only home, all difficulties, timer/blur hand-off, early permissions, direct invite join and unavailable storage/location passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
