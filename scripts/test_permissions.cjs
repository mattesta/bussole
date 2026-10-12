const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('globe-prototype.js','utf8');
function extract(name) {
  const i=source.indexOf(`function ${name}(`);assert.ok(i>=0,name);
  let end=source.indexOf('{',i),depth=1;
  for(end++;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return (source.slice(Math.max(0,i-6),i)==='async '?'async ':'')+source.slice(i,end);
}
function fixture({motion='granted',geo='granted',android=false,missingMotion=false,missingGeo=false,storageBlocked=false,headings=true}={}) {
  const order=[],stored={},events={},state={motion,geo,headings};
  let stopped=0,started=0,clockStarts=0,frames=0;
  function element(){return{hidden:true,textContent:'',disabled:false,classList:{toggle(name,value){this.element.hidden=value},element:null}}}
  const panel=element();panel.classList.element=panel;
  const c=vm.createContext({console,Promise,Date,
    window:{addEventListener(type,fn){events[type]=fn},BussoleCompass:{createTracker({onHeading}){return{start(){started++;if(state.headings)onHeading(30)},stop(){stopped++}}}}},
    navigator:{},document:{visibilityState:'visible',addEventListener(type,fn){events[type]=fn}},
    sessionStorage:{setItem(key,value){if(storageBlocked)throw Error('Blocked');stored[key]=value}},
    accessPanel:panel,accessMessage:{},accessRetry:{},statusEl:{},showLineBtn:{},
    locationReady:false,locationError:null,locationRequest:null,accessRequest:null,accessBusy:false,
    orientationPermissionGranted:false,orientationStarted:false,orientationFrameId:null,
    compassUsable:false,compassWarning:null,compassSubmitted:false,compassTracker:null,
    pendingHeading:null,smoothHeading:null,manualBearing:false,
    playerLatLng:[40.2506,18.2794],mapReady:true,targetLatLng:[0,0],lineRevealed:false,
    soloTimerSeconds:3,soloTimerActive:false,soloCountdown:{sync(){clockStarts++}},
    updatePlayerMarker(){},updatePlayerBlur(){},frameAimingView(){frames++},stopSoloTimer(){},cancelAnimationFrame(){},
    handleCompassHeading(){c.compassUsable=true;c.updateGoButtonState()},handleCompassStatus(){c.compassUsable=false;c.updateGoButtonState()}
  });
  if(!missingMotion)c.DeviceOrientationEvent=android?{}:{requestPermission(){order.push('motion');if(state.motion==='throw')throw Error('NotAllowed');return Promise.resolve(state.motion)}};
  if(!missingGeo)c.navigator.geolocation={getCurrentPosition(ok,fail){order.push('geo');if(state.geo==='throw')throw Error('SecurityError');if(state.geo==='granted')ok({coords:{latitude:48.1,longitude:11.6}});else fail({code:state.geo==='timeout'?3:1,message:'Blocked'})}};
  vm.runInContext(['updateAccessPanel','persistAccess','refreshPlayerLocation','startOrientation','useMyLocation','recheckAccess','updateGoButtonState'].map(extract).join('\n'),c);
  return {c,state,order,stored,panel,events,counts:()=>({stopped,started,clockStarts,frames})};
}
(async()=>{
  // iOS request runs synchronously from the retry gesture, before geolocation.
  const good=fixture();const pending=good.c.useMyLocation();assert.deepEqual(good.order,['motion','geo']);await pending;
  assert.equal(good.c.locationReady,true);assert.equal(good.c.showLineBtn.disabled,false);assert.equal(good.panel.hidden,true);
  assert.equal(good.counts().clockStarts,1);assert.ok(good.counts().frames>0);
  for(const options of [{motion:'denied'},{motion:'throw'},{geo:'denied'},{geo:'timeout'},{geo:'throw'},{missingGeo:true},{missingMotion:true},{headings:false}]) {
    const f=fixture(options);await f.c.useMyLocation();
    assert.equal(f.c.showLineBtn.disabled,true,JSON.stringify(options));assert.equal(f.panel.hidden,false);assert.equal(f.c.accessRetry.disabled,false);
    assert.equal(f.counts().clockStarts,0);
  }
  // A failed attempt is not cached forever. A later tap can recover both APIs.
  const denied=fixture({motion:'denied',geo:'denied'});await denied.c.useMyLocation();
  denied.state.motion='granted';denied.state.geo='granted';await denied.c.useMyLocation();
  assert.equal(denied.c.showLineBtn.disabled,false);assert.equal(denied.order.filter(x=>x==='motion').length,2);
  // Android has no requestPermission function; attach the tracker normally.
  const android=fixture({android:true});await android.c.useMyLocation();assert.equal(android.c.showLineBtn.disabled,false);assert.equal(android.order.includes('motion'),false);
  // No session storage hand-off / a direct globe link can still recover.
  const direct=fixture({storageBlocked:true});await direct.c.useMyLocation();assert.equal(direct.c.showLineBtn.disabled,false);
  // Returning from another app refreshes the position and restarts the tracker,
  // without attempting an iOS permission prompt outside a user gesture.
  const before=good.order.filter(x=>x==='motion').length;good.c.recheckAccess();await good.c.locationRequest;
  assert.equal(good.order.filter(x=>x==='motion').length,before);assert.ok(good.counts().stopped>0);
  good.state.geo='denied';good.c.recheckAccess();await good.c.locationRequest;
  assert.equal(good.c.locationReady,false);assert.equal(good.c.showLineBtn.disabled,true);
  // Result inspection doesn't request permissions again or recenter the globe.
  const result=fixture();result.c.lineRevealed=true;result.c.recheckAccess();assert.equal(result.order.length,0);
  result.c.updateAccessPanel();assert.equal(result.panel.hidden,true);
  // Manual bearing never substitutes a real location.
  const manual=fixture({missingGeo:true,missingMotion:true});manual.c.manualBearing=true;await manual.c.useMyLocation();assert.equal(manual.c.showLineBtn.disabled,true);
  assert.ok(source.includes('if (!locationReady) return;'));assert.ok(!source.includes('Using Calimera'));
  console.log('Permissions: iOS gesture ordering, Android, deny/throw/timeout, unavailable APIs, direct/storage-free links, retries, background return, revoked location, timer gate and result inspection passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
