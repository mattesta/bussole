// Emulator WebSockets must connect directly to localhost, bypassing shell proxies.
for (const key of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']) delete process.env[key];
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, set, get, update, runTransaction } = require('firebase/database');
const player = (name, slot) => ({ name, colorIndex: slot, slotId: String(slot), connected: true, joinedAt: Date.now(), ready: false, locked: false, wins: 0, eligibleRound: 1 });
(async () => {
  const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-bussole', database: { host, port: Number(port), rules: fs.readFileSync('database.rules.json', 'utf8') } });
  try {
    const db = uid => env.authenticatedContext(uid).database();
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
    console.log('Firebase public directory, private isolation, slot races, capacity, grace, phase and private compatibility tests passed.');
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
