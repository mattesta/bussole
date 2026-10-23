const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let end = source.indexOf('{', start), depth = 1;
  for (end++; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
const functions = ['destLatLng','greatCirclePoints','toUnitVector','dot','cross','normalizeVector','angleBetween','vectorToLatLng','nearestPointOnLine','greatCircleArcBetween'];
function fixture(globe) {
  const source = fs.readFileSync(globe ? 'globe-prototype.js' : 'app.js', 'utf8');
  const c = vm.createContext({window:{}, console});
  vm.runInContext('const EARTH_RADIUS=6378137;'+functions.concat(globe ? [] : ['distance','vectorLength']).map(name => extract(source,name)).join('\n'), c);
  vm.runInContext(fs.readFileSync('scoring.js','utf8'),c);
  vm.runInContext(fs.readFileSync('public-privacy.js','utf8'),c);
  vm.runInContext(`globalThis.geo={
    route:s=>greatCirclePoints(s.lat,s.lon,s.heading,s.distanceMeters${globe ? '' : ',400'}),
    destination:destLatLng,nearest:nearestPointOnLine,arc:greatCircleArcBetween,
    distance:(a,b)=>${globe ? 'angleBetween(toUnitVector(a),toUnitVector(b))*EARTH_RADIUS' : 'distance(a[0],a[1],b[0],b[1])'}
  };`,c);
  return {c, source, publish:(s,t,m='medium') => c.window.BussolePublicPrivacy.publish(s,t,m,c.geo)};
}
for (const globe of [false,true]) {
  const {c,source,publish}=fixture(globe);
  const s={lat:0,lon:0,heading:90,distanceMeters:20000000};
  const distant={lat:4,lon:35};
  const shared=publish(s,distant);
  assert.ok(shared.points>=200);
  assert.deepEqual(Object.keys(shared).sort(),['points','version']);
  const near=publish(s,{lat:0,lon:2});
  assert.equal(near.points,1000);
  for(const [origin,target,mode] of [
    [s,distant,'medium'],[s,{lat:0,lon:2},'easy'],
    [{...s,distanceMeters:3000000},{lat:2,lon:27},'hard'],
    [{lat:40,lon:12,heading:0,distanceMeters:20000000},{lat:85,lon:40},'medium'],
    [{...s,distanceMeters:2*Math.PI*6378137+3000000},{lat:0,lon:27},'hard']
  ])assert.deepEqual(Object.keys(publish(origin,target,mode)).sort(),['points','version']);
  assert.equal(c.window.BussolePublicPrivacy.hasGeometry(shared),false);

  // Exercise the actual renderer with a full own route, reduced rival route,
  // hidden rival result, and DNF. Hidden rivals add no layers or camera points.
  const lines=[], bounds=[], targetStyle={};let blurred=false, distanceHidden=false;
  Object.assign(c, {
    mapReady:true,playerLatLng:[0,0],targetLatLng:null,targetLabel:'',lineRevealed:false,roundActive:true,
    targetEl:{},statusEl:{},multiplayerLayers:[],
    distanceInput:{blur(){blurred=true}},distanceInputWrap:{classList:{add(){distanceHidden=true}}},targetMarker:{getElement(){return{style:targetStyle}}},
    clearLines(){},clearMultiplayerLayers(){},hideBlurCircle(){},unlockMap(){},updatePlayerBlur(){},updateTargetMarker(){},updateAccessPanel(){},setMapInteraction(){},setStatus(){},
    frameResult(points){bounds.push(...points)},
    hudEl:{getBoundingClientRect(){return{height:100}}},
    map:{setBearing(){},fitBounds(){}},
    L:{polyline(points,style){lines.push({points,style});return{addTo(){return this}}},latLngBounds(points){bounds.push(...points);return{pad(){return this}}}},
    addMultiplayerLine(id,points,color,width){lines.push({id,points,color,width})}
  });
  vm.runInContext(extract(source,'renderMultiplayerResults'),c);
  const entries=[
    {uid:'own',name:'Own',color:'#e41a1c',errorColor:'#ff8587',submission:s,publicResult:shared},
    {uid:'rival',name:'Rival',color:'#377eb8',errorColor:'#86c5f4',publicResult:shared},
    {uid:'hidden',name:'Hidden',color:'#4daf4a',errorColor:'#92dc8f',publicResult:near},
    {uid:'dnf',name:'DNF',color:'#984ea3'}
  ];
  const results=c.renderMultiplayerResults(entries,globe ? {...distant,label:'Target'} : [distant.lat,distant.lon],'medium');
  assert.equal(results.find(r=>r.uid==='hidden').points,1000);
  assert.equal(results.find(r=>r.uid==='hidden').errorMeters,undefined);
  assert.equal(results.find(r=>r.uid==='dnf').errorMeters,null);
  assert.equal(results.find(r=>r.uid==='own').points,shared.points);
  assert.equal(lines.length,2); // Own lines only; rivals share points.
  assert.ok(results.find(r=>r.uid==='own').errorMeters>0);
  assert.ok(!lines.slice(2).some(line=>line.points.some(p=>p[0]===0 && p[1]===0)));
  if(globe){assert.equal(blurred,true);assert.equal(distanceHidden,true);assert.equal(targetStyle.background,'#92dc8f')}
  console.log(`${globe?'3D':'2D'}: points-only payloads at poles/long routes, own geometry rendering and no rival geometry passed.`);
}
