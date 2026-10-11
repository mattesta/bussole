const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let callback, cleared = 0, now = 0;
const context = vm.createContext({ window: {}, setInterval(fn) { callback = fn; return 1; }, clearInterval() { cleared++; } });
vm.runInContext(fs.readFileSync('round-timer.js', 'utf8'), context);
const timer = context.window.BussoleRoundTimer;
for (const n of [3, 10, 60, '3']) assert.equal(timer.validDuration(n), true);
for (const n of [2, 61, '', 3.5, 'abc']) assert.equal(timer.validDuration(n), false);
assert.equal(timer.duration({ timerSeconds: 3, timerDuration: 10 }), 3);
assert.equal(timer.duration({ timerDuration: 30 }), 30);
assert.equal(timer.duration({ timerDuration: 300 }), 60);
const classes = new Set(['hidden']);
const element = { style: {}, setAttribute() {}, classList: {
  add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
  toggle(c, active) { active ? classes.add(c) : classes.delete(c); }
} };
const clock = timer.create(element, { getBoundingClientRect() { return { bottom: 100 }; } }, () => now);
clock.sync({ phase: 'aiming', deadline: 15000 });
assert.equal(element.textContent, '15 s');
assert.equal(classes.has('urgent'), false);
assert.equal(element.style.top, '108px');
now = 5000; callback(); assert.equal(classes.has('urgent'), false);
now = 9000; callback(); assert.equal(element.textContent, '6 s'); assert.equal(classes.has('urgent'), false);
now = 10000; callback(); assert.equal(element.textContent, '5 s'); assert.equal(classes.has('urgent'), true);
now = 10001; callback(); assert.equal(classes.has('urgent'), true);
now = 11000; callback(); assert.equal(element.textContent, '4 s'); assert.equal(classes.has('urgent'), true);
now = 14000; callback(); assert.equal(element.textContent, '1 s');
// Returning from a background tab catches up against the deadline immediately.
now = 17000; callback(); assert.equal(element.textContent, '0 s');
clock.sync({ phase: 'revealed', deadline: 15000 });
assert.equal(classes.has('hidden'), true);
assert.ok(cleared > 0);
clock.sync({ phase: 'aiming', deadline: null });
assert.equal(classes.has('hidden'), true);
clock.sync({ phase: 'aiming', deadline: 20000 });
assert.equal(element.textContent, '3 s');
clock.stop(); assert.equal(classes.has('hidden'), true);
console.log('Timer range, legacy settings, deadline, urgency, background catch-up and cleanup passed.');

let expirations = 0;
const soloClock = timer.create(element, { getBoundingClientRect() { return { bottom: 50 }; } }, () => now, () => { expirations++; });
now = 0; soloClock.sync({ phase: 'aiming', deadline: 3000 });
assert.equal(element.textContent, '3 s');
now = 3000; callback(); callback();
assert.equal(expirations, 1);
soloClock.stop();
now = 4000; soloClock.sync({ phase: 'aiming', deadline: 7000 });
now = 7000; callback();
assert.equal(expirations, 2);
console.log('Solo expiry fires once and reset starts a fresh timer.');
