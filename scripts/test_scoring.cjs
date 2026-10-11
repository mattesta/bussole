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

// Crossing the goal is evaluated after the whole round, not submission order.
const finalists = [
  { uid: 'a', name: 'A', points: 400 },
  { uid: 'b', name: 'B', points: 900 }
];
const prior = {
  a: { name: 'A', roundScores: { 1: 4700 } },
  b: { name: 'B', roundScores: { 1: 4500 } }
};
const finalRanking = scoring.rank(finalists, prior, 2);
assert.equal(scoring.outcome(finalRanking, 5000)[0].uid, 'b');
assert.equal(scoring.outcome(finalRanking, 6000).length, 0);
assert.equal(scoring.outcome([{ name: 'A', totalPoints: 5000 }], 5000).length, 1);
assert.equal(scoring.outcome([{ name: 'A', totalPoints: 5000 }, { name: 'B', totalPoints: 5000 }], 5000).length, 2);
assert.match(scoring.matchMessage(finalRanking, 5000), /B wins with 5400/);
assert.match(scoring.matchMessage([{ name: 'A', totalPoints: 5000 }, { name: 'B', totalPoints: 5000 }], 5000), /Draw/);
assert.equal(scoring.goal(undefined), 5000);
assert.equal(scoring.goal(-3), 5000);
assert.equal(scoring.goal('7000'), 7000);
assert.equal(scoring.standings(prior)[0].uid, 'a');
const next = scoring.lobbyUpdates(prior, 2, false);
assert.equal(next['players/a/locked'], false);
assert.equal(Object.hasOwn(next, 'players/a/roundScores'), false);
const fresh = scoring.lobbyUpdates(prior, 2, true);
assert.equal(fresh['players/a/roundScores'], null);
assert.equal(fresh['players/a/totalPoints'], 0);
assert.equal(fresh['players/b/eligibleRound'], 3);
assert.equal(fresh['meta/matchStartRound'], 2);
assert.equal(Object.hasOwn(fresh, 'meta/round'), false);
assert.equal(fresh.target, null);
console.log('Match goal, tie, standings and restart checks passed.');
