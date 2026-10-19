const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('globe-prototype.js','utf8');
function extract(name){const i=source.indexOf(`function ${name}(`);let end=source.indexOf('{',i),depth=1;for(end++;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(i,end);}
let camera={center:[90,-30],zoom:0,padding:{top:100}},animating=false;
const c=vm.createContext({mapReady:true,playerLatLng:[48.1,11.6],heading:120,AIMING_ZOOM:16,soloGameMode:false,multiplayerMode:false,
 normalizeLongitude:value=>(value+540)%360-180,
 map:{stop(){animating=false},jumpTo(value){camera=structuredClone(value)},easeTo(){animating=true;camera.center=[50,9]},setBearing(value){animating=false;camera.bearing=value}},
 window:{dispatchEvent(){}},CustomEvent:function(){},stopSoloTimer(){},clearLines(){},clearMultiplayerLayers(){},removeTargetMarker(){},updateGoButtonState(){},updatePlayerBlur(){},updateClearSearchButton(){},setRandomButtonState(){},setMapInteraction(){},
 targetEl:{},searchBox:{},statusEl:{},bearingInput:{},bearingValue:{},compassNeedle:{style:{}},normalizeHeading:value=>value
});
vm.runInContext(['frameAimingView','setTarget','resetPrototype','updateBearing'].map(extract).join('\n'),c);
for(const action of [()=>c.setTarget(-20,170,'Remote target',true),()=>c.resetPrototype()]){
 camera={center:[90,-30],zoom:0};action();c.updateBearing(130,true);
 assert.deepEqual(camera.center,[11.600000000000023,48.1]);assert.equal(camera.zoom,16);assert.equal(animating,false);assert.equal(camera.padding.top,0);
}
console.log('Solo camera: Next Target and Reset atomically restore the real player center/zoom before compass updates can interrupt the return.');
