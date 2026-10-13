const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function element(dataset={}) {return {dataset,events:{},attributes:{},classList:{toggle(key,value){this[key]=value}},addEventListener(type,fn){(this.events[type]||=[]).push(fn)},setAttribute(key,value){this.attributes[key]=value},dispatchEvent(event){for(const fn of this.events[event.type]||[])fn(event)}}}
const inputs={},groups=[];
for(const [id,values,initial] of [['roomVisibility',['private','public'],'private'],['roomMode',['easy','medium','hard'],'medium']]) {
 const input=inputs[id]=element();input.value=initial;
 const buttons=values.map(choiceValue=>element({choiceValue}));
 groups.push({...element({choiceInput:id}),buttons,querySelectorAll(){return buttons}});
}
const context={document:{getElementById(id){return inputs[id]},querySelectorAll(){return groups}},window:{},Event:class {constructor(type,options){this.type=type;Object.assign(this,options)}}};
vm.runInNewContext(fs.readFileSync('choice-buttons.js','utf8'),context);
assert.equal(groups[0].buttons[0].attributes['aria-pressed'],'true');
let changes=0;inputs.roomVisibility.addEventListener('change',()=>changes++);
groups[0].buttons[1].events.click[0]();
assert.equal(inputs.roomVisibility.value,'public');assert.equal(changes,1);
assert.equal(groups[0].buttons[0].classList.selected,false);assert.equal(groups[0].buttons[1].classList.selected,true);
groups[0].buttons[1].events.click[0]();assert.equal(changes,1);
inputs.roomMode.value='hard';context.window.BussoleChoices.sync('roomMode');
assert.equal(groups[1].buttons[2].attributes['aria-pressed'],'true');assert.equal(groups[1].buttons[1].classList.selected,false);
groups[1].buttons[0].disabled=true;groups[1].buttons[0].events.click[0]();assert.equal(inputs.roomMode.value,'hard');
for(const file of ['index.html','globe-prototype.html','match-summary.html'])assert.ok(!/<select\b/i.test(fs.readFileSync(file,'utf8')),file);
console.log('Choice buttons: defaults, selection, change events, server sync, disabled controls and no active dropdowns passed.');
