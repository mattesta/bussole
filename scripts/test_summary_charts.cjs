const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};}setAttribute(k,v){this.attrs[k]=v}append(...nodes){this.children.push(...nodes)}appendChild(n){this.children.push(n);return n}}
const c=vm.createContext({window:{},document:{createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)},Intl});vm.runInContext(fs.readFileSync('summary-charts.js','utf8'),c);
const chart=c.window.BussoleSummaryCharts;
const walk=element=>[element,...element.children.flatMap(walk)];
const kind=(element,name)=>walk(element).filter(node=>node.attrs.class===name);
const samples=errors=>errors.map((error,index)=>({error,round:index+1,target:'A <safe> target'}));
const d=chart.distance(samples([-50,50]),0),dots=kind(d,'chart-guess-dot');
assert.equal(dots.length,2);assert.equal(Number(dots[0].attrs.cx),24);assert.equal(Number(dots[1].attrs.cx),296);
assert.equal(dots[0].children[0].textContent,'Round 1 · A <safe> target: -50%');
assert.ok(kind(d,'chart-mean-dot')[0].attrs.d.startsWith('M160 '));
const duplicates=kind(chart.distance(samples([0,0,0,0,0]),0),'chart-guess-dot');assert.equal(new Set(duplicates.map(p=>p.attrs.cy)).size,5);
const large=kind(chart.distance(samples([-100,1e8]),5e7),'chart-guess-dot');assert.ok(large.every(p=>Number(p.attrs.cx)>=24&&Number(p.attrs.cx)<=296));
const a=chart.angle(samples([-90,90,180]),180),rays=kind(a,'chart-guess-ray');
assert.equal(Number(rays[0].attrs.x2),74);assert.equal(Number(rays[1].attrs.x2),246);assert.ok(Number(rays[2].attrs.y2)>128);
assert.ok(Number(kind(a,'chart-mean-ray')[0].attrs.y2)>128);
assert.equal(kind(chart.angle(samples([-90,90]),null),'chart-mean-ray').length,0);
assert.equal(kind(chart.distance([],null),'chart-mean-dot').length,0);
assert.equal(kind(chart.angle([],null),'chart-guess-ray').length,0);
for(const figure of [d,a,chart.distance([],null),chart.angle([],null)]){assert.equal(figure.children[0].attrs.role,'img');assert.doesNotMatch(JSON.stringify(figure),/NaN|Infinity/);}
console.log('Summary charts: normalized zero, exact signed positions, repeated dots, outliers, full-circle rays, undefined means, empty data and safe labels passed.');
