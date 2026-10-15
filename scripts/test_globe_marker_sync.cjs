const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('globe-marker-sync.js','utf8'),c);
const handlers=new Map();
const map={on(type,fn){handlers.set(type,fn)},off(type,fn){assert.equal(handlers.get(type),fn);handlers.delete(type)}};
let projection=0,calls=0;
function marker(){const position={lng:32.58,lat:.347};return{screen:0,getLngLat(){return position},setLngLat(point){assert.equal(point,position);this.screen=projection;calls++}}}
const player=marker(),target=marker();let active=[player,null];
c.window.BussoleGlobeMarkerSync.attach(map,()=>active);
handlers.get('render')();assert.equal(calls,1);
active=[player,target];
// The final globe projection changes after camera events stop. A render alone
// must bring both DOM markers into line, without synthetic movement/repaints.
projection=42;handlers.get('render')();assert.equal(player.screen,42);assert.equal(target.screen,42);
active=[];const before=calls;handlers.get('render')();assert.equal(calls,before);
handlers.get('remove')();assert.equal(handlers.has('render'),false);
console.log('Globe marker sync: render-only projection changes, current marker list, unchanged coordinates and removal cleanup passed.');
