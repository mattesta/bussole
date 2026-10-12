const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function checkController(file, globe) {
  const elements = new Map();
  function element() {
    return {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      style: {}, children: [], value: '', textContent: '',
      focus() {}, checkValidity() { return true; }, reportValidity() {},
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      set innerHTML(value) { this.children = value ? [element(), element(), element()] : []; }
    };
  }
  const updates = [];
  const redirects = [];
  const reads = [];
  let capturedEntries;
  const raw = {lat:41.12345,lon:12.98765,heading:20,distanceMeters:20000000};
  const shared = {a:{version:1,points:400},b:{version:1,points:900}};
  const players = {
    a: { name: 'A', colorIndex: 0, connected: true, roundScores: { 1: 4700 } },
    b: { name: 'B', colorIndex: 1, connected: true, roundScores: { 1: 4500 } }
  };
  const settings = { mode: 'medium', scoreGoal: 5000 };
  const context = vm.createContext({
    console, structuredClone, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
    location: { search: globe ? '?multiplayer=1&room=ABCDEF' : '', replace(url){redirects.push(url)} },
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelector: element, createElement: element, addEventListener() {}, body: element()
    },
    initializeApp() {}, firebaseConfig: {}, getAuth() { return {}; }, getDatabase() {},
    onAuthStateChanged() {}, ref(db, path) { return path; }, serverTimestamp() { return 123; },
    async get(path) {
      reads.push(path);
      return { val() { return path.endsWith('settings') ? settings : path.includes('submissions/2/a') ? raw : path.includes('publicResults/2') ? shared : {}; } };
    },
    async runTransaction(path, callback) {
      const uid = path.split('/').at(-1);
      players[uid] = callback(players[uid]) || players[uid];
    },
    async update(path, changes) { updates.push(changes); },
    window: {
      addEventListener() {},
      BussoleGame: { registerMultiplayer() {}, resetMultiplayerRound() {}, publicResult(){return shared.a}, revealMultiplayer(entries) { capturedEntries=entries; return results; } },
      BussoleGlobe: { isReady() { return true; }, setStatus(){}, publicResult(){return shared.a}, revealMultiplayer(entries) { capturedEntries=entries; return results; } }
    }
  });
  context.window.location=context.location;
  const results = [
    { uid: 'a', name: 'A', points: 400, errorMeters: 10, color: 'red' },
    { uid: 'b', name: 'B', points: 900, errorMeters: 2, color: 'blue' }
  ];
  vm.runInContext(fs.readFileSync('scoring.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('round-timer.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('explorers.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public-rooms.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('match-report.js', 'utf8'), context);
  let source = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\s*/gm, '');
  const expose = `globalThis.test = {
    setup(p, s, publicRoom=false, phase='revealed') { user = { uid: 'a' }; roomMeta = { hostId: 'a', round: 2, phase, visibility:publicRoom?'public':'private' }; players = p; ${globe ? 'settings' : 'roomSettings'} = s; ${globe ? 'target' : 'selectedTarget'} = {}; ${globe ? 'shownRound=null;' : "roomCode = 'ABCDEF';preparedRound=null;"} },
    showResults, nextRound, submitLine${globe ? '' : ', handlePhase, startRound, validateTimer, setupLobby() { roomMeta.round = 0; roomMeta.phase = \"lobby\"; }'}
  };`;
  source = globe ? source.replace('  initialize();', expose) : source + expose;
  vm.runInContext(source, context);
  context.test.setup(players, settings);
  await context.test.showResults({});
  assert.equal(elements.get(globe ? 'globeResultsTitle' : 'roundResultsTitle').textContent, 'Match results');
  assert.match(elements.get(globe ? 'globeMatchOutcome' : 'matchOutcome').textContent, /B wins with 5400/);
  assert.equal(elements.get(globe ? 'globeNextRoundBtn' : 'nextRoundBtn').textContent, 'New match');
  await context.test.nextRound();
  const fresh = updates.at(-1);
  assert.equal(fresh['players/a/roundScores'], null);
  assert.equal(fresh['players/b/roundScores'], null);
  assert.equal(fresh['meta/matchStartRound'], 2);
  assert.equal(fresh['meta/phase'], 'lobby');
  // Below the goal, Next round preserves scores.
  context.test.setup({ a: { name: 'A', roundScores: { 1: 100 } } }, settings);
  await context.test.nextRound();
  assert.equal(Object.hasOwn(updates.at(-1), 'players/a/roundScores'), false);
  if (!globe) {
    context.test.setup({}, settings);
    context.test.setupLobby();
    context.document.getElementById('roomScoreGoal').value = '5000';
    elements.get('roomTimerEnabled').checked = true;
    context.document.getElementById('roomMode').value = 'medium';
    context.document.getElementById('roomMapStyle').value = '2d';
    context.document.getElementById('roomBlurEnabled').checked = true;
    for (const seconds of ['2', '61']) {
      context.document.getElementById('roomTimerDuration').value = seconds;
      const count = updates.length;
      await context.test.startRound();
      assert.equal(updates.length, count);
    }
    for (const seconds of ['3', '60']) {
      context.document.getElementById('roomTimerDuration').value = seconds;
      await context.test.startRound();
      const change = updates.at(-1);
      assert.equal(change.settings.timerSeconds, Number(seconds));
      assert.equal(change.settings.blurEnabled, true);
      assert.ok(change.settings.timerDuration >= 10); // Existing rules remain compatible.
      assert.equal(change['meta/deadline'] - change['meta/startedAt'], Number(seconds) * 1000);
    }
  }
  context.test.setup(players,settings,true,'aiming');
  await context.test.submitLine(raw);
  const submitted = updates.findLast(change=>change['publicResults/2/a']);
  assert.equal(submitted['submissions/2/a'].lat,raw.lat);
  assert.equal(submitted['publicResults/2/a'].lat,undefined);
  assert.equal(submitted['publicResults/2/a'].points,400);
  context.test.setup(players,settings,true);
  reads.length=0;
  await context.test.showResults(shared);
  assert.equal(capturedEntries.find(entry=>entry.uid==='a').submission.lat,raw.lat);
  assert.equal(capturedEntries.find(entry=>entry.uid==='b').submission,null);
  assert.equal(capturedEntries.find(entry=>entry.uid==='b').publicResult.points,900);
  assert.ok(!reads.some(path=>path.endsWith('submissions/2')||path.endsWith('submissions/2/b')));
  if(!globe) {
    for(const phase of ['aiming','revealed']) {
      context.test.setup(players,{...settings,mapStyle:'2d'},false,phase);
      await context.test.handlePhase();
      assert.ok(redirects.at(-1).startsWith('globe-prototype.html?'));
      assert.ok(redirects.at(-1).includes('multiplayer=1'));
    }
    context.test.setup(players,settings,false,'lobby');
    const before=redirects.length;await context.test.handlePhase();assert.equal(redirects.length,before);
  }
  console.log(`${file}: final results, whole-round winner and restart passed.`);
}
(async () => {
  await checkController('multiplayer.js', false);
  await checkController('globe-multiplayer.js', true);
})().catch(error => { console.error(error); process.exitCode = 1; });
