const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const globe = fs.readFileSync('globe-prototype.js', 'utf8');
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`), body = source.indexOf('{', start);
  let end = body + 1, depth = 1;
  while (depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return source.slice(start, end);
}
let appends = 0, removals = 0, overlay;
const context = vm.createContext({ window: {}, document: { createElement() {
  return overlay = { style: {}, setAttribute() {}, remove() { removals++; } };
} } });
vm.runInContext(fs.readFileSync('player-blur.js', 'utf8'), context);
vm.runInContext(fn(app, 'destLatLng'), context);
const project = ([lat, lon]) => ({ x: lon * 10000, y: Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * -180 / Math.PI * 10000 });
const blur = context.window.BussolePlayerBlur.create({ appendChild() { appends++; } }, project, context.destLatLng);
blur.show(0, 0);
const equatorSize = parseFloat(overlay.style.width);
assert.ok(equatorSize > 0);
blur.show(60, 0);
assert.ok(parseFloat(overlay.style.width) > equatorSize * 1.9);
assert.equal(appends, 1);
blur.show(0, 179.999);
assert.ok(parseFloat(overlay.style.width) < equatorSize * 1.01); // No seam-spanning circle.
blur.hide(); assert.equal(removals, 1);
blur.show(0, 0); assert.equal(appends, 2);
let shown = 0, hidden = 0;
Object.assign(context, { playerBlur: { show() { shown++; }, hide() { hidden++; } },
  blurEnabled: true, roundActive: true, lineVisible: false,
  playerLatLng: [40,18], mapReady: true, lineRevealed: false });
vm.runInContext(fn(app, 'showBlurCircle') + '\n' + fn(globe, 'updatePlayerBlur'), context);
context.showBlurCircle(40,18); assert.equal(shown, 1);
context.roundActive = false; context.showBlurCircle(40,18); assert.equal(hidden, 1);
context.roundActive = true; context.lineVisible = true; context.showBlurCircle(40,18); assert.equal(hidden, 2);
context.updatePlayerBlur(); assert.equal(shown, 2);
context.lineRevealed = true; context.updatePlayerBlur(); assert.equal(hidden, 3);
context.blurEnabled = false; context.lineRevealed = false; context.updatePlayerBlur(); assert.equal(hidden, 4);
console.log('Blur projection, latitude scale, date line, updates, results cleanup and opt-out passed.');
