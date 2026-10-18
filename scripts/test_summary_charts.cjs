const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};}setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}replaceChildren(...nodes){this.children=nodes}addEventListener(type,fn){this.events[type]=fn}getBoundingClientRect(){return{left:0,top:0,width:320}}append(...nodes){this.children.push(...nodes)}appendChild(n){this.children.push(n);return n}}
const c=vm.createContext({window:{},document:{createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)},Intl});vm.runInContext(fs.readFileSync('summary-charts.js','utf8'),c);
const chart=c.window.BussoleSummaryCharts;
const walk=element=>[element,...element.children.flatMap(walk)];
const kind=(element,name)=>walk(element).filter(node=>node.attrs.class===name);
const samples=errors=>errors.map((error,index)=>({error,round:index+1,target:'A <safe> target'}));
const d=chart.distance(samples([-50,50]),0),dots=kind(d,'chart-guess-tick');
assert.equal(dots.length,2);assert.equal(Number(dots[0].attrs.x1),24);assert.equal(Number(dots[1].attrs.x1),296);
assert.equal(dots[0].children[0].textContent,'Round 1 · A <safe> target: -50%');
assert.ok(kind(d,'chart-mean-dot')[0].attrs.d.startsWith('M160 '));
const duplicates=kind(chart.distance(samples([0,0,0,0,0]),0),'chart-guess-tick');assert.equal(duplicates.length,5);assert.ok(duplicates.every(p=>Number(p.attrs.x1)===160));
const large=kind(chart.distance(samples([-100,1e8]),5e7),'chart-guess-tick');assert.ok(large.every(p=>Number(p.attrs.x1)>=24&&Number(p.attrs.x1)<=296));
const a=chart.angle(samples([-90,90,180]),180),rays=kind(a,'chart-guess-ray');
assert.equal(Number(rays[0].attrs.x2),74);assert.equal(Number(rays[1].attrs.x2),246);assert.ok(Number(rays[2].attrs.y2)>128);
assert.ok(Number(kind(a,'chart-mean-ray')[0].attrs.y2)>128);
assert.equal(kind(chart.angle(samples([-90,90]),null),'chart-mean-ray').length,0);
assert.equal(kind(chart.distance([],null),'chart-mean-dot').length,0);
assert.equal(kind(chart.angle([],null),'chart-guess-ray').length,0);
for(const figure of [d,a,chart.distance([],null),chart.angle([],null)]){assert.equal(figure.children[0].attrs.role,'img');assert.doesNotMatch(JSON.stringify(figure),/NaN|Infinity/);}
// Touch inspection uses the actual stroke, never empty areas or the extended highlight.
const svg=d.children[0],touch=(x,y)=>({touches:[{clientX:x,clientY:y}],preventDefault(){this.prevented=true}});
svg.events.touchstart(touch(24,70));assert.equal(kind(d,'chart-selected-stroke').length,1);assert.equal(Number(kind(d,'chart-selected-stroke')[0].attrs.y2),34);
assert.ok(kind(d,'chart-inspection-text').some(n=>n.textContent==='A <safe> target'));
svg.events.touchmove(touch(120,70));assert.equal(kind(d,'chart-selected-stroke').length,0);
svg.events.touchmove(touch(296,70));assert.equal(Number(kind(d,'chart-selected-stroke')[0].attrs.x1),296);
svg.events.touchend();assert.equal(kind(d,'chart-selected-stroke').length,0);
svg.events.touchstart(touch(24,34));assert.equal(kind(d,'chart-selected-stroke').length,0); // An extended endpoint is outside the original tick.
svg.events.touchcancel();svg.events.touchstart(touch(30,70));assert.equal(kind(d,'chart-selected-stroke').length,0);svg.events.touchstart(touch(28,70));assert.equal(kind(d,'chart-selected-stroke').length,1);svg.events.touchcancel();assert.equal(kind(d,'chart-selected-stroke').length,0);
const angleSvg=a.children[0];angleSvg.events.touchstart(touch(200,128));assert.equal(kind(a,'chart-selected-stroke').length,1);
assert.equal(Number(kind(a,'chart-selected-stroke')[0].attrs.x2),268);
angleSvg.events.touchmove(touch(220,188));assert.equal(kind(a,'chart-selected-stroke').length,0);
angleSvg.events.touchmove(touch(100,128));assert.equal(Number(kind(a,'chart-selected-stroke')[0].attrs.x2),52);
angleSvg.events.touchend();assert.equal(kind(a,'chart-selected-stroke').length,0);
const historical=chart.angle([{error:20}],20);historical.children[0].events.touchstart(touch(180,73));assert.ok(kind(historical,'chart-inspection-text').some(n=>n.textContent==='Guess'));
console.log('Summary charts: normalized zero, exact signed positions, coincident ticks, outliers, full-circle rays, touch hit thresholds, release/cancel cleanup, historical privacy, undefined means, empty data and safe labels passed.');
