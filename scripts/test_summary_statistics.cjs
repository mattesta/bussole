const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});
for(const path of ['scoring.js','report-geometry.js','summary-statistics.js'])vm.runInContext(fs.readFileSync(path,'utf8'),c);
const geo=c.window.BussoleReportGeometry,calculate=c.window.BussoleSummaryStatistics.calculate;
const R=6378137,degree=R*Math.PI/180;
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function round(heading,lon=10,mode='medium',ratio=1) {
  return {mode,target:{lat:0,lon},entries:[{uid:'me',submission:{lat:0,lon:0,heading,distanceMeters:(mode==='hard'?lon*ratio:180)*degree}},
    {uid:'other',submission:{lat:0,lon:0,heading:270,distanceMeters:degree}}]};
}
const report=rounds=>({uid:'me',rounds});
const dnf={mode:'hard',target:{lat:0,lon:10},entries:[{uid:'me',submission:null}]};
let stats=calculate(report([round(110),round(80),round(110),dnf]));
assert.equal(stats.completed,3);assert.equal(stats.missed,1);
close(stats.absoluteAngle,50/3);close(stats.angleBias,10.1039093610171);
assert.equal(stats.distanceBias,null);
// Relative errors are averaged per guess, not weighted by target distance.
stats=calculate(report([round(90,10,'hard',.8),round(90,100,'hard',1.1),dnf]));
close(stats.relativeError,15);close(stats.absoluteDistance,15);close(stats.distanceBias,-5);
assert.equal(stats.distanceCount,2);close(stats.absoluteAngle,0);
// Bearing wraps correctly over north and the date line.
close(geo.measure({lat:0,lon:0,heading:350,distanceMeters:degree},{lat:10,lon:0},'medium').angleError,-10);
close(geo.measure({lat:0,lon:0,heading:10,distanceMeters:degree},{lat:10,lon:0},'medium').angleError,10);
close(geo.measure({lat:0,lon:179,heading:100,distanceMeters:degree},{lat:0,lon:-179},'medium').angleError,10);
// A badly wrong Pro distance can exceed 100%; do not cap or wrap it.
stats=calculate(report([round(90,10,'hard',4)]));close(stats.distanceBias,300);
// Undefined bearings and zero denominators never produce a fictitious zero.
stats=calculate(report([round(90,0,'hard')]));
assert.equal(stats.angleCount,0);assert.equal(stats.relativeCount,0);assert.equal(stats.distanceCount,0);
assert.equal(stats.absoluteAngle,null);assert.equal(stats.relativeError,null);
stats=calculate(report([round(90,180)]));assert.equal(stats.angleCount,0);
stats=calculate(report([dnf]));assert.equal(stats.completed,0);assert.equal(stats.angleBias,null);
// Signed angles near the back of the circle must not average to zero.
stats=calculate(report([round(269),round(271)]));close(Math.abs(stats.angleBias),180);close(stats.absoluteAngle,179);
assert.equal(stats.angleSamples.length,2);close(stats.angleSamples[0].error,179);close(stats.angleSamples[1].error,-179);
stats=calculate(report([round(180),round(0)]));assert.equal(stats.angleBias,null);close(stats.absoluteAngle,90);
stats=calculate(report([round(90,10,'hard',.5),round(90,10,'hard',1.5),dnf]));
close(stats.distanceBias,0);close(stats.absoluteDistance,50);assert.equal(stats.distanceSamples.length,2);
close(stats.distanceSamples[0].error,-50);close(stats.distanceSamples[1].error,50);
assert.equal(stats.angleSamples.length,2); // Other players and DNF never enter the charts.
console.log('Statistics: personal-only means, DNF exclusion, relative weighting, signed bearings, Pro distance bias, wraparound and undefined geometry passed.');
