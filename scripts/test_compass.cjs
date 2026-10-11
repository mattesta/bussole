const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const listeners = new Map(), timers = new Set();
const root = { screen:{orientation:{angle:0}}, addEventListener:(type,fn)=>listeners.set(type,fn), removeEventListener:type=>listeners.delete(type) };
vm.runInNewContext(fs.readFileSync(require.resolve('../compass.js'),'utf8'), { window:root, Date, Math, Number, setTimeout:fn=>{timers.add(fn);return fn;}, clearTimeout:fn=>timers.delete(fn) });
const {read,createTracker}=root.BussoleCompass;
function event(alpha,beta=0,gamma=0) {return {type:'deviceorientationabsolute',alpha,beta,gamma,absolute:true};}
function close(value,expected) {assert.ok(Math.abs(((value-expected+540)%360)-180)<1e-8,`${value} != ${expected}`);}
for(const [alpha,heading] of [[0,0],[90,270],[180,180],[270,90],[359,1]]) {
  // Mild tilts of either sign must not flip the compass as they did when the
  // back normal was almost vertical (flat-phone singularity).
  for(const beta of [-30,-1,-0.1,0,0.1,1,30]) for(const gamma of [-15,0,15]) close(read(event(alpha,beta,gamma)).heading,heading);
}
close(read(event(0),90).heading,90);
close(read(event(90),270).heading,180);
assert.equal(read(event(0,90)).reason,'tilted');
assert.equal(read(event(0,-90)).reason,'tilted');
assert.equal(read({...event(20),type:'deviceorientation',absolute:false}).reason,'relative');
assert.equal(read({...event(20),alpha:null}).reason,'missing');
assert.equal(read({...event(20),alpha:NaN}).reason,'missing');
close(read({type:'deviceorientation',webkitCompassHeading:123,absolute:false},0).heading,123);
close(read({type:'deviceorientation',webkitCompassHeading:350},90).heading,80);
assert.equal(read({type:'deviceorientation',webkitCompassHeading:-1}).heading,null);
const headings=[], statuses=[];
const tracker=createTracker({onHeading:h=>headings.push(h),onStatus:s=>statuses.push(s)});
tracker.start();tracker.start();assert.equal(listeners.size,2);
listeners.get('deviceorientation')({...event(90),type:'deviceorientation',absolute:false});
assert.equal(headings.length,0);
listeners.get('deviceorientationabsolute')(event(270,0.1,10));close(headings[0],90);
assert.equal(timers.size,0);
listeners.get('deviceorientation')({...event(0),type:'deviceorientation',absolute:false});
assert.equal(headings.length,1); // a relative event never overrides north
listeners.get('deviceorientationabsolute')(event(270,90));assert.equal(statuses.at(-1),'tilted');
tracker.stop();assert.equal(listeners.size,0);assert.equal(timers.size,0);
tracker.start();for(const timer of timers) timer();assert.equal(statuses.at(-1),'unavailable');tracker.stop();
console.log('Compass cardinal, tilt, source selection and lifecycle checks passed.');
