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
  const players = {
    a: { name: 'A', colorIndex: 0, connected: true, roundScores: { 1: 4700 } },
    b: { name: 'B', colorIndex: 1, connected: true, roundScores: { 1: 4500 } }
  };
  const settings = { mode: 'medium', scoreGoal: 5000 };
  const context = vm.createContext({
    console, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
    location: { search: globe ? '?multiplayer=1&room=ABCDEF' : '' },
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelector: element, createElement: element, addEventListener() {}, body: element()
    },
    initializeApp() {}, firebaseConfig: {}, getAuth() { return {}; }, getDatabase() {},
    onAuthStateChanged() {}, ref(db, path) { return path; }, serverTimestamp() { return 123; },
    async get(path) { return { val() { return path.endsWith('settings') ? settings : {}; } }; },
    async runTransaction(path, callback) {
      const uid = path.split('/').at(-1);
      players[uid] = callback(players[uid]) || players[uid];
    },
    async update(path, changes) { updates.push(changes); },
    window: {
      addEventListener() {},
      BussoleGame: { registerMultiplayer() {}, resetMultiplayerRound() {}, revealMultiplayer() { return results; } },
      BussoleGlobe: { isReady() { return true; }, revealMultiplayer() { return results; } }
    }
  });
  const results = [
    { uid: 'a', name: 'A', points: 400, errorMeters: 10, color: 'red' },
    { uid: 'b', name: 'B', points: 900, errorMeters: 2, color: 'blue' }
  ];
  vm.runInContext(fs.readFileSync('scoring.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('round-timer.js', 'utf8'), context);
  let source = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\s*/gm, '');
  const expose = `globalThis.test = {
    setup(p, s) { user = { uid: 'a' }; roomMeta = { hostId: 'a', round: 2, phase: 'revealed' }; players = p; ${globe ? 'settings' : 'roomSettings'} = s; ${globe ? 'target' : 'selectedTarget'} = {}; ${globe ? '' : "roomCode = 'ABCDEF';"} },
    showResults, nextRound${globe ? '' : ', startRound, validateTimer, setupLobby() { roomMeta.round = 0; roomMeta.phase = \"lobby\"; }'}
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
      assert.ok(change.settings.timerDuration >= 10); // Existing rules remain compatible.
      assert.equal(change['meta/deadline'] - change['meta/startedAt'], Number(seconds) * 1000);
    }
  }
  console.log(`${file}: final results, whole-round winner and restart passed.`);
}
(async () => {
  await checkController('multiplayer.js', false);
  await checkController('globe-multiplayer.js', true);
})().catch(error => { console.error(error); process.exitCode = 1; });
