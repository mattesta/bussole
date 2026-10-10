const assert = require('node:assert/strict');
global.window = {};
require('../scoring.js');
const scoring = window.BussoleScoring;

assert.equal(scoring.points(7000, 10000), 300);
assert.equal(scoring.points(7000, 1000000), 993);
assert.equal(scoring.points(0, 10000), 1000);
assert.equal(scoring.points(20000, 10000), 0);
assert.equal(scoring.points(null, 10000), 0);
assert.equal(scoring.points(0, 0), 1000);

const first = scoring.record({ name: 'Magellan' }, 1, 300);
assert.equal(first.totalPoints, 300);
assert.equal(scoring.record(first, 1, 300), undefined);
const second = scoring.record(first, 2, 993);
assert.equal(second.totalPoints, 1293);

const results = [
  { uid: 'a', name: 'A', points: 500 },
  { uid: 'b', name: 'B', points: 900 }
];
const players = { a: { roundScores: { 1: 1000 } }, b: { roundScores: { 1: 0 } } };
const ranking = scoring.rank(results, players, 2);
assert.equal(ranking[0].uid, 'a');
assert.equal(ranking[0].totalPoints, 1500);
players.a.roundScores[2] = 500;
assert.equal(scoring.rank(results, players, 2)[0].totalPoints, 1500);
console.log('Scoring checks passed.');
