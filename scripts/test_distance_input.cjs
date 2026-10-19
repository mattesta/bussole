const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('distance-input.js','utf8'),c);const d=c.window.BussoleDistanceInput;
for(const [raw,formatted,number] of [['','',NaN],['999','999',999],['1000','1’000',1000],['12345678','12’345’678',12345678],['12345,6','12’345,6',12345.6],["12'345.67",'12’345.67',12345.67],['12‘345','12’345',12345],[' 12 345 ','12’345',12345],['.5','.5',.5]]){assert.equal(d.format(raw),formatted);assert.equal(d.parse(formatted),number);}
for(const raw of ['-5','100abc','1e4','1.2.3','Infinity'])assert.ok(Number.isNaN(d.parse(raw)));
const events={};const input={value:'1234',selectionStart:4,selectionEnd:4,addEventListener(type,fn){events[type]=fn},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}};d.attach(input);
events.input();assert.equal(input.value,'1’234');assert.equal(input.selectionStart,5);
input.value='12345';input.selectionStart=input.selectionEnd=2;events.input();assert.equal(input.value,'12’345');assert.equal(input.selectionStart,2);
input.selectionStart=input.selectionEnd=3;let prevented=false;events.beforeinput({inputType:'deleteContentBackward',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(input.value,'1’345');assert.equal(input.selectionStart,1);
input.selectionStart=input.selectionEnd=1;events.beforeinput({inputType:'deleteContentForward',preventDefault(){}});assert.equal(input.value,'145');assert.equal(input.selectionStart,1);
console.log('Pro distance: live thousands grouping, decimal parsing, pasted separators, invalid input rejection, caret and deletion around separators passed.');

// The real Pro Go handler must submit the full distance, not stop at the separator.
const globe=fs.readFileSync('globe-prototype.js','utf8');
const handler=globe.slice(globe.indexOf('function showPrototypeLine('),globe.indexOf('function renderMultiplayerResults('));
let submitted;
Object.assign(c,{lineRevealed:false,compassSubmitted:false,soloGameMode:false,locationReady:true,compassUsable:true,manualBearing:false,mapReady:true,targetLatLng:[1,2],gameMode:'hard',ROUTE_DISTANCE_METERS:20000000,distanceInput:{value:'12’345,6',focus(){}},playerLatLng:[0,0],heading:15,showLineBtn:{},statusEl:{},multiplayerController:{isActive:()=>true,submitLine(value){submitted=value}}});
vm.runInContext(handler,c);c.showPrototypeLine();assert.equal(submitted.distanceMeters,12345600);
submitted=null;c.compassSubmitted=false;c.distanceInput.value='-5';c.showPrototypeLine();assert.equal(submitted,null);

c.window.BussoleDistanceInput=null;c.distanceInput.value='1’234';c.showPrototypeLine();assert.equal(submitted.distanceMeters,1234000);
