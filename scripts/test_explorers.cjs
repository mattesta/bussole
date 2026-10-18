const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map();
function element(){return{classList:{add(){},remove(){},toggle(name,value){this.hidden=value}},showModal(){this.open=true},close(){this.open=false},focus(){}}}
const c=vm.createContext({window:{},Date,document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}}});
vm.runInContext(fs.readFileSync('explorers.js','utf8'),c);
const e=c.window.BussoleExplorers;
assert.equal(e.catalogue.length,30);assert.equal(new Set(e.catalogue.map(x=>x.name)).size,30);
assert.equal(e.catalogue[8].name,'Marco Polo');
for(const explorer of e.catalogue){assert.ok(explorer.name.length<=24);assert.ok(explorer.text.length>120);assert.ok(explorer.image.startsWith('https://'));assert.ok(explorer.imageSource.startsWith('https://commons.wikimedia.org/'));if(explorer.imageLicense?.startsWith('CC '))assert.ok(explorer.imageLicenseUrl.startsWith('https://creativecommons.org/'));}
let seed=1;const pick=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
const seen=new Set(),coloursByName=new Map();
for(let room=0;room<100;room++){
 const order=e.createOrder(pick);assert.equal(order.length,30);assert.equal(new Set(order).size,30);
 const assigned=Array.from({length:8},(_,colour)=>{const player={...e.identity(colour,order),colorIndex:colour};seen.add(player.explorerId);const colours=coloursByName.get(player.name)||new Set();colours.add(colour);coloursByName.set(player.name,colours);assert.equal(e.defaultId(player),player.explorerId);assert.equal(e.defaultId({...player,name:'My custom name'}),null);return player});
 assert.equal(new Set(assigned.map(x=>x.name)).size,8);
}
assert.equal(seen.size,30);assert.ok([...coloursByName.values()].every(colours=>colours.size>1));
for(let i=0;i<8;i++){assert.equal(e.identity(i).explorerId,i);assert.equal(e.defaultId({colorIndex:i,name:e.catalogue[i].name}),i);}
// The info card follows the explorer identity, never the player's colour.
for(let id=0;id<30;id++){
 e.open(id,element());assert.equal(elements.get('explorerTitle').textContent,e.catalogue[id].title);
 assert.ok(elements.get('explorerWikipedia').href.endsWith(e.catalogue[id].article));assert.equal(elements.get('explorerImage').src,e.catalogue[id].image);
 e.close();assert.equal(elements.get('explorerDialog').open,false);
}
const source=fs.readFileSync('multiplayer.js','utf8');
c.preferredAccountName=null;
vm.runInContext(source.slice(source.indexOf('function playerTemplate('),source.indexOf('async function createRoom(')),c);
const order=e.createOrder(pick);const player=c.playerTemplate(3,2,order);
assert.equal(player.colorIndex,3);assert.equal(player.explorerId,order[3]);assert.equal(player.name,e.catalogue[order[3]].name);assert.equal(player.eligibleRound,2);
c.preferredAccountName='My_username';const named=c.playerTemplate(3,2,order);
assert.equal(named.name,'My_username');assert.equal(named.colorIndex,3);assert.equal(named.explorerId,order[3]);assert.equal(e.defaultId(named),null);
console.log('30 explorers: biographies/images, independent name/colour shuffles, 8 unique assignments, legacy identities, renamed players and all info cards passed.');
