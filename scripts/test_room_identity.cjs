const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({resume=false,known=true}={}){
 const elements=new Map(),writes=[];let signins=0,release;
 const actor={uid:known?'existing':'replacement'},auth={currentUser:actor,async authStateReady(){}};
 const el=()=>({value:'AB-CD-EF',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},focus(){},querySelector(){return this}});
 const context=vm.createContext({crypto:require('node:crypto').webcrypto,console:{...console,error(){}},URLSearchParams,Date,setTimeout,clearTimeout,setInterval,clearInterval,
  location:{search:resume?'?room=ABCDEF&resume=1':''},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id)},addEventListener(){}},
  initializeApp(){},firebaseConfig:{},getAuth(){return auth},getDatabase(){},onAuthStateChanged(){},ref(db,p){return p},
  async signInAnonymously(){signins++;await new Promise(r=>release=r);auth.currentUser=actor;return{user:actor}},
  async get(path){const value=path.endsWith('/meta')?{phase:'lobby',visibility:'private',hostId:'existing',round:2}:{existing:{name:'Magellan',colorIndex:0,connected:true}};return{exists:()=>true,val:()=>value}},
  async set(path,value){writes.push({path,value})},
  window:{addEventListener(){},BussoleGame:{registerMultiplayer(){}},BussoleExplorers:{catalogue:[{name:'Magellan'}]},BussoleRoundTimer:{create(){return{}}}}
 });
 const source=fs.readFileSync('multiplayer.js','utf8').replace(/^import[\s\S]*?;\s*/gm,'').replace('    joinRoom();','    globalThis.autoResumePending=true;');
 vm.runInContext(source+`;enterRoom=async code=>{globalThis.entered=code};globalThis.test={ensureUser,joinRoom};`,context);
 return{context,auth,writes,signins:()=>signins,release:()=>release(),elements};
}
(async()=>{
 const race=fixture();race.auth.currentUser=null;
 const one=race.context.test.ensureUser(),two=race.context.test.ensureUser();
 await new Promise(setImmediate);assert.equal(race.signins(),1);race.release();
 assert.equal((await one).uid,'existing');assert.equal((await two).uid,'existing');
 const resumed=fixture({resume:true});await resumed.context.test.joinRoom();
 assert.equal(resumed.context.entered,'ABCDEF');assert.equal(resumed.writes.length,0);
 const newcomer=fixture({known:false});await newcomer.context.test.joinRoom();
 assert.equal(newcomer.context.entered,'ABCDEF');assert.equal(newcomer.writes.length,1);
 const lost=fixture({resume:true,known:false});await lost.context.test.joinRoom();
 assert.equal(lost.context.entered,undefined);assert.equal(lost.writes.length,0);
 assert.match(lost.elements.get('multiplayerEntryMessage').textContent,/could not be restored/);
 console.log('Room identity: concurrent anonymous sign-in is shared; round resume restores an existing seat and never creates a phantom player after auth loss.');
})().catch(e=>{console.error(e);process.exitCode=1});
