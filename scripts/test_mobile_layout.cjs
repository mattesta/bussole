const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const vars={},timer={style:{},offsetHeight:43},viewport={height:844,offsetTop:0,addEventListener(){}},controls={getBoundingClientRect(){return{height:150}}};
const c=vm.createContext({window:{innerHeight:844,visualViewport:viewport,addEventListener(){}},document:{activeElement:{tagName:'DIV'},querySelector(){return controls},documentElement:{style:{setProperty(key,value){vars[key]=value}}},body:{classList:{contains(){return true}}},getElementById(){return timer},addEventListener(){}},requestAnimationFrame(fn){fn()}});
vm.runInContext(fs.readFileSync('mobile-layout.js','utf8'),c);
assert.equal(timer.style.top,'625px');
c.document.activeElement.tagName='INPUT';viewport.height=330;viewport.offsetTop=90;
c.window.BussoleMobileLayout.update();
assert.equal(vars['--keyboard-inset'],'424px');assert.equal(vars['--search-gap'],'12px');
assert.equal(timer.style.top,'365px');assert.ok(parseFloat(timer.style.top)+43<=420);
// Browsers that resize the layout viewport rather than overlaying it.
c.window.innerHeight=330;viewport.height=330;viewport.offsetTop=0;c.window.BussoleMobileLayout.update();
assert.equal(timer.style.top,'275px');assert.equal(vars['--keyboard-inset'],'0px');
c.document.activeElement.tagName='DIV';c.window.innerHeight=844;viewport.height=844;c.window.BussoleMobileLayout.update();
assert.equal(vars['--search-gap'],'174px');assert.equal(timer.style.top,'625px');
assert.ok(fs.readFileSync('globe-prototype.css','utf8').includes('place-items: end center'));
console.log('Mobile layout: bottom search, lower-left timer, keyboard overlays/viewport resize and restoration passed.');
