const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
function fixture() {
  const players = Object.fromEntries([...Array(7)].map((_, i) => ['p'+i, { name: 'P'+i, colorIndex: i, connected: true }]));
  const seats = Object.fromEntries([...Array(7)].map((_, i) => [i, { uid: 'p'+i, claimedAt: Date.now() }]));
  const meta = { visibility: 'public', phase: 'lobby', round: 0, createdAt: 1, hostId: 'p0' };
  return { publicRooms: { AAAAAA: { count: 2, updatedAt: Date.now(), createdAt: 1, phase: 'lobby' }, BBBBBB: { count: 7, updatedAt: Date.now(), createdAt: 1, phase: 'lobby' } }, rooms: { AAAAAA: { meta, players: { p0: players.p0 }, seats: { 0: seats[0] } }, BBBBBB: { meta, players, seats } } };
}
function controller(uid, state) {
  const elements = new Map();
  const el = () => ({ classList: { add(){},remove(){},toggle(){},contains(){return false} }, style:{},value:'',textContent:'',children:[], addEventListener(){},setAttribute(){},removeAttribute(){}, focus(){},checkValidity(){return true}, reportValidity(){} });
  const read = path => path.split('/').reduce((value, key) => value?.[key], state);
  const write = (path,value) => { const parts=path.split('/'), key=parts.pop(); let parent=state; for(const part of parts) parent=parent[part] ||= {}; if(value===null) delete parent[key]; else parent[key]=structuredClone(value); };
  const context = vm.createContext({console:{...console,error(){}},Date,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,crypto:webcrypto,
    location:{search:''},document:{getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id)},createElement:el,addEventListener(){}},
    firebaseConfig:{},initializeApp(){},getDatabase(){},getAuth(){return{currentUser:{uid},async authStateReady(){}}},onAuthStateChanged(){},ref(db,path){return path},serverTimestamp(){return Date.now()},
    async get(path){if(path==='publicRooms'&&state.denied)throw Object.assign(Error('Denied'),{code:'PERMISSION_DENIED'});const value=structuredClone(read(path));return{val(){return value},exists(){return value!=null}}},
    async set(path,value){write(path,value)},async runTransaction(path,fn){const value=fn(structuredClone(read(path)));if(value===undefined)return{committed:false};write(path,value);return{committed:true}},
    window:{addEventListener(){},BussoleGame:{registerMultiplayer(){}}}
  });
  for(const file of ['round-timer.js','scoring.js','public-rooms.js','explorers.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  let source=fs.readFileSync('multiplayer.js','utf8').replace(/^import[\s\S]*?;\s*/gm,'');
  source+=`enterRoom=async(code)=>{globalThis.entered=code;roomCode=code};createRoom=async(visibility)=>{globalThis.created=visibility};globalThis.test={joinPublicRoom,reservePublicSeat,maybeAutoStart,setup(actor,meta,p){user={uid:actor};roomMeta=meta;players=p;settingsReady=true},auto(){selectedTarget=null;selectRandomTarget=async()=>{globalThis.randoms=(globalThis.randoms||0)+1;selectedTarget={}};startRound=async()=>{globalThis.starts=(globalThis.starts||0)+1}}};`;
  vm.runInContext(source,context);return context;
}
(async()=>{
  const state=fixture(), c=controller('visitor',state);
  await c.test.joinPublicRoom();assert.equal(c.entered,'BBBBBB');assert.equal(state.rooms.BBBBBB.players.visitor.slotId,'7');
  const race=fixture(), a=controller('a',race), b=controller('b',race);
  a.test.setup('a',race.rooms.BBBBBB.meta,race.rooms.BBBBBB.players);b.test.setup('b',race.rooms.BBBBBB.meta,race.rooms.BBBBBB.players);
  const results=await Promise.allSettled([a.test.reservePublicSeat('BBBBBB',race.rooms.BBBBBB.meta,race.rooms.BBBBBB.players),b.test.reservePublicSeat('BBBBBB',race.rooms.BBBBBB.meta,race.rooms.BBBBBB.players)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const empty=controller('solo',{publicRooms:{},rooms:{}});await empty.test.joinPublicRoom();assert.equal(empty.created,'public');
  const denied=controller('solo',{denied:true,rooms:{}});await denied.test.joinPublicRoom();assert.equal(denied.created,undefined);
  const full=Object.fromEntries([...Array(8)].map((_,i)=>[i,{connected:true}]));
  c.test.setup('host',{hostId:'host',visibility:'public',phase:'lobby',round:0},full);c.test.auto();
  await Promise.all([c.test.maybeAutoStart(),c.test.maybeAutoStart()]);assert.equal(c.randoms,1);assert.equal(c.starts,1);
  console.log('Controller fullest-room join, competing pending claims, create fallback, missing rules and once-only auto-start passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
