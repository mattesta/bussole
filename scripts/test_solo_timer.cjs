const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const globe = fs.readFileSync('globe-prototype.js', 'utf8');
function actualFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const body = source.indexOf('{', start);
  let depth = 1, end = body + 1;
  while (depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return source.slice(start, end);
}
const notices = [];
const clocks = [];
const context = vm.createContext({
  window: {}, Date, document: { getElementById() { return { classList: { toggle(c, hidden) { notices.push(hidden); } } }; } },
  timerDurationInput: { value: '3', setAttribute() {}, focus() {} },
  timerCheckbox: { checked: true }, timerEnabled: true, timerDuration: 3, timerActive: false,
  soloCountdown: { sync(meta) { clocks.push(meta); }, stop() {} }
});
vm.runInContext(fs.readFileSync('round-timer.js', 'utf8'), context);
vm.runInContext(['validateSoloTimer', 'startTimer', 'stopSoloTimer'].map(name => actualFunction(app, name)).join('\n'), context);
for (const [value, valid] of [['2', false], ['61', false], ['3', true], ['60', true], ['3.5', false]]) {
  context.timerDurationInput.value = value;
  assert.equal(context.validateSoloTimer(), valid);
  assert.equal(notices.at(-1), valid);
}
context.startTimer();
assert.equal(context.timerActive, true);
assert.ok(clocks[0].deadline >= Date.now() + 2900);
context.stopSoloTimer(); assert.equal(context.timerActive, false);
context.timerDuration = 61; context.startTimer(); assert.equal(clocks.length, 1);
// The actual mode tap validates before handing off to either renderer.
const tapStart = app.indexOf("    timerEnabled = timerCheckbox.checked;", app.indexOf("document.querySelectorAll('.modeBtn')"));
const tapEnd = app.indexOf('    gameMode = btn.dataset.mode;', tapStart);
context.selectedMapStyle = '3d';
context.blurCheckbox = { checked: false };
context.btn = { dataset: { mode: 'medium' } };
let launches = 0;
context.launchGlobeMode = () => { launches++; };
vm.runInContext(`function tapMode() { ${app.slice(tapStart, tapEnd)} }`, context);
context.timerDurationInput.value = '2'; context.tapMode(); assert.equal(launches, 0);
context.timerDurationInput.value = '3'; context.tapMode(); assert.equal(launches, 1);
assert.equal(context.timerDuration, 3);
// The globe starts its clock only once it can accept a line, and never in multiplayer.
Object.assign(context, { showLineBtn: {}, mapReady: true, targetLatLng: [0,0], lineRevealed: false,
  locationReady: true, updateAccessPanel(){},
  compassSubmitted: false, compassUsable: false, manualBearing: false,
  soloTimerSeconds: 3, soloTimerActive: false });
vm.runInContext(actualFunction(globe, 'updateGoButtonState'), context);
const before = clocks.length;
context.updateGoButtonState(); assert.equal(clocks.length, before);
context.compassUsable = true; context.updateGoButtonState(); assert.equal(clocks.length, before + 1);
context.updateGoButtonState(); assert.equal(clocks.length, before + 1);
context.soloTimerSeconds = 0; context.soloTimerActive = false;
context.updateGoButtonState(); assert.equal(clocks.length, before + 1);
console.log('Solo range validation, 2D cleanup, 3D launch validation and ready-to-aim countdown passed.');
