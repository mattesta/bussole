const assert = require('node:assert/strict');
require('../globe-lines.js');
const { vertex, segments, project, clipSegment } = global.BussoleGlobeLines;
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const data = { mainMatrix: identity, fallbackMatrix: identity, projectionTransition: 1, clippingPlane: [0,0,1,0] };
// Polar coordinates remain at their true latitude, beyond Mercator's tile edge.
for (const lat of [88, 90, -88, -90]) {
  const p = vertex([lat, 23]);
  assert.ok(Math.abs(p.sphere[1] - Math.sin(lat * Math.PI / 180)) < 1e-12);
  assert.ok(p.mercator.every(Number.isFinite));
}
assert.ok(Math.abs(project(vertex([90, 0]), data)[1] - 1) < 1e-12);
// Seam crossings travel the short way, in both directions and over many turns.
for (const points of [[[20,179],[20,-179]], [[20,-179],[20,179]], [[0,539],[0,-179]]]) {
  const pair = segments(points)[0];
  assert.ok(Math.abs(pair[1].mercator[0] - pair[0].mercator[0]) < 0.01);
}
assert.equal(clipSegment([0,0,2,1], [0.1,0,2,1]), null); // behind horizon
const clipped = clipSegment([0,0,0,1], [2,0,0,1]);
assert.deepEqual(clipped, [[0,0,0,1],[1,0,0,1]]);
assert.equal(clipSegment([0,0,0,-1], [0,0,0,-2]), null);
assert.ok(clipSegment([0,0,0,1], [0,0,2,1])); // horizon crossing
console.log('Globe line geometry checks passed.');
