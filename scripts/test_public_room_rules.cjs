// Emulator WebSockets must connect directly to localhost, bypassing shell proxies.
for (const key of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']) delete process.env[key];
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, set, get, update, runTransaction, onValue } = require('firebase/database');
const player = (name, slot) => ({ name, colorIndex: slot, slotId: String(slot), connected: true, joinedAt: Date.now(), ready: false, locked: false, wins: 0, eligibleRound: 1 });
(async () => {
  const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-bussole', database: { host, port: Number(port), rules: fs.readFileSync('database.rules.json', 'utf8') } });
  try {
    const db = uid => env.authenticatedContext(uid).database();
    // Reproduce the production path error with the actual SDK, then verify
    // the virtual .info listener used by public matchmaking.
    await assert.rejects(get(ref(db('clock'), '.info/serverTimeOffset')), /invalid token in path/i);
    const offset = await new Promise((resolve,reject)=>onValue(ref(db('clock'),'.info/serverTimeOffset'),snapshot=>resolve(snapshot.val()),reject,{onlyOnce:true}));
    assert.equal(typeof offset,'number');
    const room = { meta: { hostId: 'host', visibility: 'public', phase: 'lobby', round: 0, createdAt: Date.now() }, settings: { mode: 'medium', timerEnabled: false, timerDuration: 60 }, players: { host: player('Host', 0) }, seats: { 0: { uid: 'host', claimedAt: Date.now() } } };
    await assertSucceeds(set(ref(db('host'), 'rooms/ABCDEF'), room));
    await assertFails(get(ref(env.unauthenticatedContext().database(), 'publicRooms')));
    await assertSucceeds(set(ref(db('host'), 'publicRooms/ABCDEF'), { count: 1, phase: 'lobby', createdAt: room.meta.createdAt, updatedAt: Date.now() }));
    await assertFails(set(ref(db('stranger'), 'publicRooms/ABCDEF'), { count: 1, phase: 'lobby', createdAt: room.meta.createdAt, updatedAt: Date.now() }));
    await assertSucceeds(get(ref(db('stranger'), 'publicRooms')));
    await assertFails(set(ref(db('stranger'), 'rooms/ABCDEF/players/stranger'), player('Stranger', 1)));
    await assertFails(set(ref(db('stranger'), 'rooms/ABCDEF/seats/0'), { uid: 'stranger', claimedAt: Date.now() }));
    const results = await Promise.allSettled(['a','b'].map(uid => runTransaction(ref(db(uid), 'rooms/ABCDEF/seats/1'), owner => owner ? undefined : { uid, claimedAt: Date.now() })));
    const owner = (await get(ref(db('host'), 'rooms/ABCDEF/seats/1'))).val().uid;
    assert.ok(['a','b'].includes(owner));
    const loser = owner === 'a' ? 'b' : 'a';
    await assertFails(set(ref(db(loser), 'rooms/ABCDEF/seats/1'), { uid: loser, claimedAt: Date.now() }));
    await assertFails(set(ref(db(loser), `rooms/ABCDEF/players/${loser}`), player(loser, 1)));
    await assertSucceeds(set(ref(db(owner), `rooms/ABCDEF/players/${owner}`), player(owner, 1)));
    await assertFails(set(ref(db(owner), `rooms/ABCDEF/players/${owner}`), { ...player(owner, 2), slotId: '1' }));
    for (let slot = 2; slot < 8; slot++) {
      const uid = `p${slot}`;
      await assertSucceeds(set(ref(db(uid), `rooms/ABCDEF/seats/${slot}`), { uid, claimedAt: Date.now() }));
      await assertSucceeds(set(ref(db(uid), `rooms/ABCDEF/players/${uid}`), player(uid, slot)));
    }
    await assertFails(set(ref(db('ninth'), 'rooms/ABCDEF/seats/8'), { uid: 'ninth', claimedAt: Date.now() }));
    await assertFails(set(ref(db('ninth'), 'rooms/ABCDEF/players/ninth'), player('Ninth', 7)));
    await assertSucceeds(update(ref(db(owner), `rooms/ABCDEF/players/${owner}`), { connected: false, lastSeenAt: Date.now() }));
    await assertFails(set(ref(db('new'), 'rooms/ABCDEF/seats/1'), { uid: 'new', claimedAt: Date.now() }));
    await assertSucceeds(update(ref(db(owner), `rooms/ABCDEF/players/${owner}`), { lastSeenAt: 0 }));
    await assertSucceeds(set(ref(db('host'), `rooms/ABCDEF/players/${owner}`), null));
    await assertSucceeds(set(ref(db('host'), 'rooms/ABCDEF/seats/1'), null));
    await assertSucceeds(set(ref(db('new'), 'rooms/ABCDEF/seats/1'), { uid: 'new', claimedAt: Date.now() }));
    await assertSucceeds(set(ref(db('new'), 'rooms/ABCDEF/players/new'), player('New', 1)));
    await env.withSecurityRulesDisabled(async context => {
      await update(ref(context.database(), 'rooms/ABCDEF/seats/0'), { claimedAt: Date.now() - 60000 });
    });
    await assertSucceeds(update(ref(db('host'), 'rooms/ABCDEF'), {
      'meta/phase': 'aiming', 'meta/round': 1,
      settings: room.settings, 'players/host/ready': false, 'players/host/locked': false
    }));
    await assertSucceeds(update(ref(db('host'), 'rooms/ABCDEF/players/host'), { roundScores: { 1: 900 }, totalPoints: 900 }));
    const raw = { lat: 41.12345, lon: 12.98765, heading: 20, distanceMeters: 20000000 };
    const reduced = { version: 1, points: 700, route: Array.from({length:61},(_,i)=>[45,i/10]), errorArc: [[45,3],[46,3]] };
    await assertSucceeds(update(ref(db('new'), 'rooms/ABCDEF'), {
      'submissions/1/new': raw, 'publicResults/1/new': reduced
    }));
    await assertSucceeds(get(ref(db('new'), 'rooms/ABCDEF/submissions/1/new')));
    await assertFails(get(ref(db('host'), 'rooms/ABCDEF/submissions/1/new')));
    await assertFails(get(ref(db(owner), 'rooms/ABCDEF/submissions/1/new')));
    await assertFails(get(ref(db('new'), 'rooms/ABCDEF/publicResults/1'))); // reveal barrier
    await assertFails(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), {...reduced,lat:41}));
    await assertFails(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), {...reduced,heading:20}));
    await assertFails(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), {...reduced,points:199}));
    await assertFails(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), {...reduced,route:[[0,0]]}));
    await assertSucceeds(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), {version:1,points:100}));
    await assertSucceeds(set(ref(db('new'), 'rooms/ABCDEF/publicResults/1/new'), reduced));
    await assertSucceeds(update(ref(db('host'), 'rooms/ABCDEF/meta'), {phase:'revealed'}));
    await assertSucceeds(get(ref(db('host'), 'rooms/ABCDEF/publicResults/1')));
    await assertFails(get(ref(db('outsider'), 'rooms/ABCDEF/publicResults/1')));
    await assertFails(get(ref(db('host'), 'rooms/ABCDEF/submissions/1')));
    await assertFails(get(ref(db('host'), 'rooms/ABCDEF/submissions/1/new')));
    await assertFails(get(ref(db('outsider'), 'rooms/ABCDEF/submissions/1/new')));
    await assertFails(set(ref(db('late'), 'rooms/ABCDEF/seats/1'), { uid: 'late', claimedAt: Date.now() }));
    await assertSucceeds(set(ref(db('host'), 'publicRooms/ABCDEF'), null));
    await assertFails(set(ref(db('host'), 'publicRooms/ABCDEF'), { count: 8, phase: 'lobby', createdAt: room.meta.createdAt, updatedAt: Date.now() }));
    await assertFails(get(ref(db('host'), 'rooms')));
    await assertSucceeds(update(ref(db('host'), 'rooms/ABCDEF/meta'), { phase: 'lobby' }));
    await assertSucceeds(set(ref(db('host'), 'rooms/ABCDEF/seats/1'), null));
    await assertFails(set(ref(db('late'), 'rooms/ABCDEF/seats/1'), { uid: 'late', claimedAt: Date.now() }));
    await assertFails(set(ref(db('host'), 'publicRooms/ABCDEF'), { count: 7, phase: 'lobby', createdAt: room.meta.createdAt, updatedAt: Date.now() }));
    const pendingRoom = { ...room, players: { host: player('Host', 0) }, seats: { 0: { uid: 'host', claimedAt: Date.now() } } };
    await assertSucceeds(set(ref(db('host'), 'rooms/GHIJKL'), pendingRoom));
    await assertSucceeds(set(ref(db('pending'), 'rooms/GHIJKL/seats/1'), { uid: 'pending', claimedAt: Date.now() }));
    await assertFails(set(ref(db('replacement'), 'rooms/GHIJKL/seats/1'), { uid: 'replacement', claimedAt: Date.now() }));
    await env.withSecurityRulesDisabled(async context => {
      await update(ref(context.database(), 'rooms/GHIJKL/seats/1'), { claimedAt: Date.now() - 31000 });
    });
    await assertSucceeds(set(ref(db('replacement'), 'rooms/GHIJKL/seats/1'), { uid: 'replacement', claimedAt: Date.now() }));
    // Private rooms remain unlisted and support the existing player format.
    await assertSucceeds(set(ref(db('private'), 'rooms/PRIVATE'), { ...room, meta: { ...room.meta, hostId: 'private', visibility: 'private' }, players: { private: { ...player('Private', 0), slotId: null } }, seats: null }));
    await assertFails(set(ref(db('private'), 'publicRooms/PRIVATE'), { count: 1, phase: 'lobby', createdAt: room.meta.createdAt, updatedAt: Date.now() }));
    await assertSucceeds(set(ref(db('guest'), 'rooms/PRIVATE/players/guest'), { ...player('Guest', 1), slotId: null }));
    await assertSucceeds(update(ref(db('private'), 'rooms/PRIVATE/meta'), {phase:'aiming',round:1}));
    await assertSucceeds(set(ref(db('guest'), 'rooms/PRIVATE/submissions/1/guest'), raw));
    await assertSucceeds(update(ref(db('private'), 'rooms/PRIVATE/meta'), {phase:'revealed'}));
    assert.equal((await assertSucceeds(get(ref(db('private'), 'rooms/PRIVATE/submissions/1')))).val().guest.lat,raw.lat);
    console.log('Firebase info-path regression, public directory, reservations, owner-only origins, reduced results, reveal barrier and private full-route compatibility tests passed.');
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
