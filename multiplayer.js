import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getDatabase, get, onDisconnect, onValue, ref, remove,
  runTransaction, serverTimestamp, set, update
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';
import { roomName } from './account-service.js?v=7';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const COLOURS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#00a6a6', '#f781bf', '#6b4c2a'];
const ERROR_COLOURS = ['#ff8587', '#86c5f4', '#92dc8f', '#d29ddd', '#ffc06a', '#70dada', '#ffc0df', '#b99a78'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 8;
const PRESENCE_GRACE_MS = 30000;

const byId = id => document.getElementById(id);
const menu = byId('menu');
const panel = byId('multiplayerPanel');
const entry = byId('multiplayerEntry');
const lobby = byId('multiplayerLobby');
const resultsPanel = byId('multiplayerResults');
const hostControls = byId('hostControls');
const roomMessage = byId('roomMessage');
const roomPlayers = byId('roomPlayers');
const playerNameInput = byId('playerNameInput');
const roomBadge = byId('roomBadge');
const roomProgress = byId('roomProgress');
const roomTargetBanner = byId('roomTargetBanner');
const closeButton = byId('multiplayerClose');
const timerEnabledInput = byId('roomTimerEnabled');
const timerSettings = byId('roomTimerSettings');
let serverTimeOffset = 0;
const countdown = window.BussoleRoundTimer.create(byId('roomCountdown'), roomTargetBanner, () => Date.now() + serverTimeOffset);
function matchStarted() {
  return (roomMeta?.round || 0) > (roomMeta?.matchStartRound || 0);
}

function validateTimer() {
  const input = byId('roomTimerDuration');
  const locked = matchStarted();
  const valid = window.BussoleRoundTimer.validDuration(locked ? window.BussoleRoundTimer.duration(roomSettings) : input.value);
  const invalid = (locked ? roomSettings.timerEnabled : timerEnabledInput.checked) && !valid;
  input.classList.toggle('invalid', invalid);
  byId('startRoomRound').disabled = !settingsReady || !selectedTarget || invalid;
  input.setAttribute('aria-invalid', String(Boolean(invalid)));
  return valid;
}
const pageParameters = new URLSearchParams(location.search);
const resumeRequested = pageParameters.get('resume') === '1';

let user = null;
let preferredAccountName = null;
let roomCode = null;
let roomMeta = null;
let players = {};
let selectedTarget = null;
let roomSettings = {};
let preparedRound = null;
let revealedRound = null;
let disconnectHandle = null;
let subscriptions = [];
let revealSubscription = null;
let timerHandle = null;
let leaving = false;
let presenceRefreshPromise = null;
let presenceRefreshQueued = false;
let databaseConnected = false;
let presenceUiTimer = null;
let hostTransferTimer = null;
let directoryTimer = null;
let directoryBusy = false;
let autoStarting = false;
let startingRound = false;
let matchmaking = false;
let settingsReady = false;
const serverNow = () => Date.now() + serverTimeOffset;
function entryError(error) {
  const message = friendlyError(error);
  byId('multiplayerEntryMessage').textContent = message;
  roomMessage.textContent = message;
}
async function requirePublicDirectory() {
  try { return (await get(ref(db, 'publicRooms'))).val() || {}; }
  catch (error) {
    if (error.code === 'PERMISSION_DENIED' || error.code === 'database/permission-denied') {
      throw new Error('Public rooms need the updated Firebase rules. Private rooms are available.');
    }
    throw error;
  }
}
async function reservePublicSeat(code, meta, currentPlayers) {
  const slots = (await get(ref(db, `rooms/${code}/seats`))).val() || {};
  const owned = Object.entries(slots).find(([, owner]) => owner?.uid === user.uid);
  if (owned && currentPlayers[user.uid]) return Number(owned[0]);
  if (!window.BussolePublicRooms.waiting(meta)) throw new Error('This public match has already started.');
  const candidates = [...Array(MAX_PLAYERS).keys()].filter(slot =>
    window.BussolePublicRooms.canClaim(slots[slot], user.uid, currentPlayers, serverNow())
  );
  while (candidates.length) {
    const slot = candidates.splice(randomIndex(candidates.length), 1)[0];
    try {
      const result = await runTransaction(ref(db, `rooms/${code}/seats/${slot}`), owner =>
        window.BussolePublicRooms.canClaim(owner, user.uid, currentPlayers, serverNow()) ? { uid: user.uid, claimedAt: serverTimestamp() } : undefined
      );
      if (result.committed) return slot;
    } catch (error) {
      if (!String(error.code).toLowerCase().includes('permission')) throw error;
    }
  }
  throw new Error('This room is full.');
}
async function addPublicPlayer(code, meta, currentPlayers) {
  const slot = await reservePublicSeat(code, meta, currentPlayers);
  const previous = currentPlayers[user.uid];
  if (previous?.slotId === String(slot)) return;
  const newPlayer = { ...playerTemplate(slot, (meta.round || 0) + 1, meta.explorerOrder), slotId: String(slot) };
  try { await set(ref(db, `rooms/${code}/players/${user.uid}`), newPlayer); }
  catch (error) {
    await runTransaction(ref(db, `rooms/${code}/seats/${slot}`), owner => owner?.uid === user.uid ? null : undefined).catch(() => {});
    throw error;
  }
}
async function publishPublicLobby() {
  if (leaving || directoryBusy || !roomCode || !isHost() || roomMeta.visibility !== 'public') return;
  const code = roomCode;
  directoryBusy = true;
  try {
    if (!window.BussolePublicRooms.waiting(roomMeta)) {
      await remove(ref(db, `publicRooms/${code}`));
      return;
    }
    // Seats from disconnected tabs are kept for 30 s, then can be reused.
    for (const [uid, player] of Object.entries(players)) {
      if (uid !== user.uid && !window.BussolePublicRooms.online(player, serverNow())) {
        await remove(ref(db, `rooms/${code}/players/${uid}`));
        if (player.slotId) {
          await runTransaction(ref(db, `rooms/${code}/seats/${player.slotId}`), seat => seat?.uid === uid ? null : undefined);
        }
      }
    }
    if (roomCode !== code || roomMeta?.phase !== 'lobby' || !isHost()) return;
    const count = Object.values(players).filter(player => window.BussolePublicRooms.online(player, serverNow())).length;
    if (!count) return;
    await set(ref(db, `publicRooms/${code}`), {
      phase: 'lobby', count, createdAt: roomMeta.createdAt, updatedAt: serverTimestamp()
    });
  } catch (error) { console.warn('Could not publish public lobby.', error); }
  finally { directoryBusy = false; }
}
async function maybeAutoStart() {
  if (!settingsReady || autoStarting || !isHost() || !window.BussolePublicRooms.shouldAutoStart(roomMeta, players, serverNow())) return;
  autoStarting = true;
  try {
    if (!selectedTarget) await selectRandomTarget();
    await startRound();
  } catch (error) { roomMessage.textContent = friendlyError(error); }
  finally { autoStarting = false; }
}
async function joinPublicRoom() {
  if (matchmaking || roomCode) return;
  matchmaking = true;
  byId('joinPublicRoomBtn').disabled = true;
  byId('multiplayerEntryMessage').textContent = 'Finding a public room…';
  try {
    user = await ensureUser();
    // .info lives in the SDK's local info tree; get() sends an invalid server path.
    serverTimeOffset = await new Promise((resolve, reject) => {
      onValue(ref(db, '.info/serverTimeOffset'), snapshot => resolve(Number(snapshot.val()) || 0), reject, { onlyOnce: true });
    });
    const directory = await requirePublicDirectory();
    for (const [code, advertised] of window.BussolePublicRooms.candidates(directory, serverNow())) {
      const meta = (await get(ref(db, `rooms/${code}/meta`))).val();
      const currentPlayers = (await get(ref(db, `rooms/${code}/players`))).val() || {};
      if (meta?.visibility !== 'public' || !window.BussolePublicRooms.waiting(meta) || meta.createdAt !== advertised.createdAt ||
          !Object.values(currentPlayers).some(player => window.BussolePublicRooms.online(player, serverNow()))) continue;
      try {
        await addPublicPlayer(code, meta, currentPlayers);
        await enterRoom(code);
        return;
      } catch (error) { console.info('Public room filled or closed; trying another.', error.message); }
    }
    await createRoom('public');
  } catch (error) { entryError(error); }
  finally { matchmaking = false; byId('joinPublicRoomBtn').disabled = false; }
}

function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }
function isHost() { return roomMeta && user && roomMeta.hostId === user.uid; }
function roomPath(suffix = '') { return `rooms/${roomCode}${suffix ? `/${suffix}` : ''}`; }
function isPlayerOnline(player) {
  if (player?.connected !== false) return true;
  const lastSeenAt = Number(player?.lastSeenAt) || 0;
  return lastSeenAt > 0 && serverNow() - lastSeenAt < PRESENCE_GRACE_MS;
}
function compactCode(value) { return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6); }
function displayCode(value) { return value.match(/.{1,2}/g)?.join('-') || value; }
function randomIndex(length) {
  if (length <= 1) return 0;
  return crypto.getRandomValues(new Uint32Array(1))[0] % length;
}
function makeCode() {
  let code = '';
  crypto.getRandomValues(new Uint8Array(6)).forEach(value => {
    code += CODE_ALPHABET[value % CODE_ALPHABET.length];
  });
  return code;
}

function setCloseButtonMode(mode) {
  const leaveMode = mode === 'leave';
  closeButton.textContent = leaveMode ? 'Leave room' : '×';
  closeButton.setAttribute('aria-label', leaveMode ? 'Leave room' : 'Close');
  closeButton.classList.toggle('leave-room-control', leaveMode);
}

function updateTimerSettingsVisibility() {
  timerSettings.classList.toggle('hidden', !timerEnabledInput.checked);
  validateTimer();
}

async function refreshPresence() {
  if (!roomCode || !user || leaving || roomMeta?.phase === 'closed') return;
  if (presenceRefreshPromise) { presenceRefreshQueued = true; return presenceRefreshPromise; }
  const activeCode = roomCode;
  const activeUserId = user.uid;
  let saved = false;
  presenceRefreshPromise = (async () => {
    if (roomCode !== activeCode || leaving) return;
    const playerRef = ref(db, `rooms/${activeCode}/players/${activeUserId}`);
    disconnectHandle = onDisconnect(playerRef);
    await disconnectHandle.update({ connected: false, lastSeenAt: serverTimestamp() });
    if (roomCode === activeCode && !leaving && roomMeta?.phase !== 'closed') {
      await update(playerRef, { connected: true, lastSeenAt: serverTimestamp() });
      saved = true;
    }
  })().catch(error => console.warn('Could not refresh multiplayer presence.', error))
    .finally(() => {
      presenceRefreshPromise = null;
      const retry = presenceRefreshQueued;
      presenceRefreshQueued = false;
      if (saved && retry && roomCode === activeCode && !leaving && databaseConnected && document.visibilityState === 'visible' &&
          players[activeUserId]?.connected === false && Number(players[activeUserId].lastSeenAt) > 0) refreshPresence();
    });
  return presenceRefreshPromise;
}

let authRequest = null;
function ensureUser() {
  if (authRequest) return authRequest;
  authRequest = (async () => {
    await auth.authStateReady();
    preferredAccountName = await roomName();
    if (auth.currentUser) return auth.currentUser;
    return (await signInAnonymously(auth)).user;
  })().finally(() => { authRequest = null; });
  return authRequest;
}

function playerTemplate(index, eligibleRound = 1, explorerOrder) {
  return {
    ...window.BussoleExplorers.identity(index, explorerOrder),
    ...(preferredAccountName ? {name:preferredAccountName} : {}),
    colorIndex: index,
    connected: true,
    joinedAt: Date.now(),
    ready: false,
    locked: false,
    wins: 0,
    eligibleRound
  };
}

async function createRoom(visibility = 'private') {
  try {
    user = await ensureUser();
    visibility = visibility === 'public' ? 'public' : 'private';
    if (visibility === 'public') await requirePublicDirectory();
    const initialMapStyle = '3d';
    let code;
    for (let attempt = 0; attempt < 8; attempt++) {
      code = makeCode();
      const roomRef = ref(db, `rooms/${code}`);
      const existing = await get(ref(db, `rooms/${code}/meta`));
      if (existing.exists() && (visibility === 'public' || existing.val().visibility === 'public')) { code = null; continue; }
      // A room-specific shuffle makes names independent of the eight colours.
      // Shared slot assignments also prevent duplicate defaults on concurrent
      // public joins, whose colour slots are already reserved atomically.
      const explorerOrder = window.BussoleExplorers.createOrder(randomIndex);
      const newPlayer = playerTemplate(randomIndex(MAX_PLAYERS), 1, explorerOrder);
      if (visibility === 'public') newPlayer.slotId = String(newPlayer.colorIndex);
      if (!existing.exists()) {
        await set(roomRef, {
          meta: { hostId: user.uid, visibility, explorerOrder, phase: 'lobby', round: 0, createdAt: Date.now(), lastActiveAt: Date.now() },
          settings: { mode: 'medium', mapStyle: initialMapStyle, timerEnabled: false, timerDuration: 60, scoreGoal: 5000, blurEnabled: false },
          players: { [user.uid]: newPlayer },
          ...(visibility === 'public' ? { seats: { [newPlayer.colorIndex]: { uid: user.uid, claimedAt: serverTimestamp() } } } : {})
        });
      } else {
        const stalePlayersSnapshot = await get(ref(db, `rooms/${code}/players`));
        const stalePlayers = stalePlayersSnapshot.val() || {};
        if (Object.values(stalePlayers).some(isPlayerOnline)) { code = null; continue; }

        // Reclaim an abandoned code as a completely fresh room. Adding our
        // player first lets the existing Firebase rules safely transfer host.
        await set(ref(db, `rooms/${code}/players/${user.uid}`), newPlayer);
        await update(ref(db, `rooms/${code}/meta`), {
          hostId: user.uid,
          visibility,
          phase: 'lobby',
          round: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          deadline: null,
          matchStartRound: 0,
          explorerOrder
        });
        await set(ref(db, `rooms/${code}/settings`), {
          mode: 'medium', mapStyle: initialMapStyle, timerEnabled: false, timerDuration: 60, scoreGoal: 5000, blurEnabled: false
        });
        await Promise.all([
          remove(ref(db, `rooms/${code}/target`)),
          remove(ref(db, `rooms/${code}/submissions`)),
          ...Object.keys(stalePlayers)
            .filter(uid => uid !== user.uid)
            .map(uid => remove(ref(db, `rooms/${code}/players/${uid}`)))
        ]);
      }
      break;
    }
    if (!code) throw new Error('Could not create a unique room.');
    await enterRoom(code);
  } catch (error) {
    entryError(error);
  }
}

async function joinRoom() {
  try {
    const code = compactCode(byId('roomCodeInput').value);
    if (code.length !== 6) throw new Error('Enter the six-character room code.');
    user = await ensureUser();
    const metaSnapshot = await get(ref(db, `rooms/${code}/meta`));
    if (!metaSnapshot.exists()) throw new Error('Room not found.');
    const joinedMeta = metaSnapshot.val();
    const playerSnapshot = await get(ref(db, `rooms/${code}/players`));
    const currentPlayers = playerSnapshot.val() || {};
    // A round transition must restore an existing seat, never register a new
    // anonymous identity as an extra explorer if browser auth was lost.
    if (resumeRequested && !currentPlayers[user.uid]) {
      throw new Error('Your player could not be restored. Go Home and rejoin the room.');
    }
    // Sending an invite often backgrounds Safari. A recent disconnect is not
    // the same as explicitly leaving; use the same grace as the lobby display.
    const hasConnectedPlayer = Object.values(currentPlayers).some(isPlayerOnline);
    const ownSeat = currentPlayers[user.uid];
    const canResumeOwnSeat = ownSeat && (isPlayerOnline(ownSeat) || (
      Number(ownSeat.lastSeenAt) > 0 && serverNow() - Number(ownSeat.lastSeenAt) < 120000
    ));
    if (joinedMeta.phase === 'closed' || (!hasConnectedPlayer && !canResumeOwnSeat)) {
      throw new Error('This room is no longer active. Ask the host to create a new room.');
    }
    if (joinedMeta.visibility !== 'public' && !currentPlayers[user.uid] && Object.keys(currentPlayers).length >= MAX_PLAYERS) {
      throw new Error('This room is full.');
    }
    if (joinedMeta.visibility === 'public') {
      await addPublicPlayer(code, joinedMeta, currentPlayers);
    } else if (!currentPlayers[user.uid]) {
      const used = new Set(Object.values(currentPlayers).map(player => player.colorIndex));
      const available = [...Array(MAX_PLAYERS).keys()].filter(candidate => !used.has(candidate));
      const index = available[randomIndex(available.length)] ?? 0;
      await set(ref(db, `rooms/${code}/players/${user.uid}`), playerTemplate(index, (joinedMeta.round || 0) + 1, joinedMeta.explorerOrder));
    }
    await enterRoom(code);
  } catch (error) {
    if (resumeRequested) {
      byId('roomResumeLoading').classList.add('room-resume-error');
      byId('roomResumeLoading').querySelector('span').textContent =
        'Could not return to the room. Go Home and rejoin.';
    }
    entryError(error);
  }
}

async function enterRoom(code) {
  roomCode = code;
  leaving = false;
  settingsReady = false;
  byId('multiplayerEntryMessage').textContent = '';
  hide(entry); show(lobby); hide(resultsPanel);
  panel.classList.add('lobby-mode');
  panel.classList.remove('results-mode');
  setCloseButtonMode('leave');
  byId('roomCodeLabel').textContent = displayCode(code);
  hide(roomBadge);
  clearInterval(directoryTimer);
  directoryTimer = setInterval(() => { publishPublicLobby(); maybeAutoStart(); }, 15000);
  history.replaceState(null, '', `${location.pathname}?room=${displayCode(code)}`);

  subscriptions.push(onValue(ref(db, '.info/connected'), snapshot => {
    databaseConnected = snapshot.val() === true;
    if (databaseConnected) refreshPresence();
  }));
  await refreshPresence();
  subscriptions.push(onValue(ref(db, '.info/serverTimeOffset'), snapshot => { serverTimeOffset = Number(snapshot.val()) || 0; }));

  subscriptions.push(onValue(ref(db, roomPath('meta')), snapshot => {
    roomMeta = snapshot.val();
    if (!roomMeta) return leaveRoom();
    renderRoom();
    publishPublicLobby();
    maybeAutoStart();
    handlePhase();
  }));
  subscriptions.push(onValue(ref(db, roomPath('players')), snapshot => {
    players = snapshot.val() || {};
    // An older page's delayed onDisconnect can arrive after navigation. The
    // currently visible, connected page must restore its own existing seat.
    if (databaseConnected && document.visibilityState === 'visible' &&
        players[user?.uid]?.connected === false && Number(players[user.uid].lastSeenAt) > 0) refreshPresence();
    renderPlayers();
    publishPublicLobby();
    maybeAutoStart();
    tryHostTransfer();
    maybeReveal();
    handlePhase();
  }));
  subscriptions.push(onValue(ref(db, roomPath('settings')), snapshot => {
    const settings = snapshot.val();
    if (!settings) return;
    roomSettings = settings;
    settingsReady = true;
    byId('roomScoreGoal').value = window.BussoleScoring.goal(settings.scoreGoal);
    renderRoom();
    byId('roomMode').value = settings.mode || 'medium';
    window.BussoleChoices?.sync('roomMode');
    byId('roomTimerEnabled').checked = Boolean(settings.timerEnabled);
    byId('roomBlurEnabled').checked = Boolean(settings.blurEnabled);
    byId('roomTimerDuration').value = settings.timerEnabled ? window.BussoleRoundTimer.duration(settings) : '';
    updateTimerSettingsVisibility();
    renderRoom();
    maybeAutoStart();
  }));
  subscriptions.push(onValue(ref(db, roomPath('target')), snapshot => {
    selectedTarget = snapshot.val();
    if (selectedTarget) {
      byId('roomTargetInput').value = selectedTarget.label;
      roomTargetBanner.textContent = `Target: ${selectedTarget.label}`;
      if (roomMeta?.phase === 'aiming' || roomMeta?.phase === 'revealed') show(roomTargetBanner);
    } else {
      byId('roomTargetInput').value = '';
      roomTargetBanner.textContent = '';
      hide(roomTargetBanner);
    }
    renderLobbyTarget();
  }));
}

function renderLobbyTarget() {
  validateTimer();
  byId('roomLobbyTarget').textContent = selectedTarget ? `Target: ${selectedTarget.label}` : 'Target not chosen yet';
}

function renderRoom() {
  if (!roomMeta) return;
  countdown.sync(roomMeta);
  if (roomMeta.phase !== 'lobby') window.BussoleExplorers.close();
  const host = isHost();
  renderLobbyTarget();
  byId('roomVisibilityLabel').textContent = roomMeta.visibility === 'public' ? 'Public room · First round starts at 8 explorers' : 'Private room · Invite by code or link';
  byId('roomSettingsSummary').textContent = window.BussolePublicRooms.summary(roomSettings);
  host ? show(hostControls) : hide(hostControls);
  byId('nextRoundBtn').classList.toggle('hidden', !host);
  const started = matchStarted();
  byId('roomMatchSettings').disabled = started;
  byId('roomMatchSettings').classList.toggle('hidden', started);
  byId('playerNameSettings').classList.toggle('hidden', started);
  playerNameInput.disabled = started;
  byId('roomSettingsSummary').classList.toggle('hidden', started);
  panel.classList.toggle('match-in-progress', started);
  byId('roomStandingsTitle').textContent = roomMeta.round > (roomMeta.matchStartRound || 0) ? 'Total standings' : 'Explorers';
  if (roomMeta.phase === 'lobby') {
    setResultsCollapsed(false);
    panel.classList.remove('results-mode');
    panel.classList.add('lobby-mode');
    setCloseButtonMode('leave');
    show(panel); show(lobby); hide(entry); hide(resultsPanel);
    hide(roomBadge);
    hide(roomTargetBanner);
    roomMessage.textContent = host ? (roomMeta.visibility === 'public' ? (window.BussolePublicRooms.waiting(roomMeta) ? 'Choose a target. Start with at least 2 explorers, or automatically at 8.' : 'Choose a target, then start the next round.') : 'Choose a target, then start the round.') : 'Waiting for the host to start…';
    document.documentElement.classList.remove('room-resuming');
  }
}

function renderPlayers() {
  clearTimeout(presenceUiTimer);
  presenceUiTimer = null;
  roomPlayers.innerHTML = '';
  const list = window.BussoleScoring.standings(players).map(player => [player.uid, player]);
  let nextPresenceExpiry = Infinity;
  list.forEach(([uid, player]) => {
    const item = document.createElement('li');
    item.className = 'room-player';
    item.innerHTML = `<span class="player-colour" style="background:${COLOURS[player.colorIndex]}"></span><span></span><span class="player-state"></span>`;
    item.children[1].textContent = `${player.name}${uid === user?.uid ? ' ★' : ''}`;
    if (uid === roomMeta?.hostId) {
      const host = document.createElement('span'); host.className = 'player-host'; host.textContent = 'Host';
      item.children[1].appendChild(host);
    }
    const points = document.createElement('span'); points.textContent = ` · ${window.BussoleScoring.total(player.roundScores)} points`;
    item.children[1].appendChild(points);
    const spectator = roomMeta?.phase === 'aiming' && (player.eligibleRound || 1) > roomMeta.round;
    const online = isPlayerOnline(player);
    item.children[2].textContent = !online ? 'Offline' : roomMeta?.phase === 'lobby' ? 'Ready' : spectator ? 'next round' : player.locked ? 'locked' : player.ready ? 'aiming' : 'Ready';
    if (player.connected === false && online) {
      nextPresenceExpiry = Math.min(
        nextPresenceExpiry,
        PRESENCE_GRACE_MS - (serverNow() - Number(player.lastSeenAt))
      );
    }
    const explorerId = window.BussoleExplorers.defaultId(player);
    if (explorerId !== null) {
      const info = document.createElement('button');
      info.type = 'button'; info.className = 'explorer-info'; info.textContent = 'i';
      info.setAttribute('aria-label', `About ${window.BussoleExplorers.catalogue[explorerId].name}`);
      info.addEventListener('click', () => window.BussoleExplorers.open(explorerId, info));
      item.appendChild(info);
    }
    roomPlayers.appendChild(item);
  });
  const me = players[user?.uid];
  if (me && document.activeElement !== playerNameInput) playerNameInput.value = me.name;
  const active = list.filter(([, player]) => isPlayerOnline(player) && (
    !roomMeta || roomMeta.phase === 'lobby' || (player.eligibleRound || 1) <= roomMeta.round
  ));
  const locked = active.filter(([, player]) => player.locked).length;
  roomProgress.textContent = roomMeta?.phase === 'aiming' ? `${locked}/${active.length} locked` : `${active.length} explorers`;
  if (Number.isFinite(nextPresenceExpiry)) {
    presenceUiTimer = setTimeout(renderPlayers, Math.max(250, nextPresenceExpiry + 50));
  }
}

async function tryHostTransfer() {
  if (!roomMeta || roomMeta.phase === 'closed' || players[roomMeta.hostId]?.connected !== false) {
    clearTimeout(hostTransferTimer);
    hostTransferTimer = null;
    return;
  }
  const disconnectedHost = players[roomMeta.hostId];
  if (Number(disconnectedHost?.lastSeenAt) > 0 && isPlayerOnline(disconnectedHost)) {
    if (!hostTransferTimer) {
      hostTransferTimer = setTimeout(() => {
        hostTransferTimer = null;
        tryHostTransfer();
      }, PRESENCE_GRACE_MS + 100);
    }
    return;
  }
  clearTimeout(hostTransferTimer);
  hostTransferTimer = null;
  const successor = Object.entries(players).filter(([, p]) => p.connected).sort((a, b) => a[1].joinedAt - b[1].joinedAt)[0];
  if (!successor) return;
  await runTransaction(ref(db, roomPath('meta/hostId')), current => current === roomMeta.hostId ? successor[0] : current);
}

async function startRound() {
  if (startingRound || !settingsReady || !isHost() || !selectedTarget || roomMeta.phase !== 'lobby') return;
  if (roomMeta.visibility === 'public' && Object.values(players).filter(player => window.BussolePublicRooms.online(player, serverNow())).length < 2) {
    roomMessage.textContent = 'At least 2 explorers are needed for a public match.'; return;
  }
  if (window.BussoleScoring.outcome(window.BussoleScoring.standings(players), roomSettings.scoreGoal).length) return;
  const goalInput = byId('roomScoreGoal');
  const locked = matchStarted();
  if (!locked && !goalInput.checkValidity()) { goalInput.reportValidity(); return; }
  const round = (roomMeta.round || 0) + 1;
  const timerEnabled = locked ? Boolean(roomSettings.timerEnabled) : byId('roomTimerEnabled').checked;
  if (timerEnabled && !validateTimer()) { byId('roomTimerDuration').focus(); return; }
  const timerSeconds = timerEnabled ? (locked ? window.BussoleRoundTimer.duration(roomSettings) : Number(byId('roomTimerDuration').value)) : 60;
  const settings = {
    mode: locked ? roomSettings.mode : byId('roomMode').value,
    mapStyle: '3d',
    scoreGoal: locked
      ? window.BussoleScoring.goal(roomSettings.scoreGoal) : window.BussoleScoring.goal(goalInput.value),
    timerEnabled,
    blurEnabled: locked ? Boolean(roomSettings.blurEnabled) : Boolean(byId('roomBlurEnabled').checked),
    timerSeconds,
    // Preserve the legacy field required by already deployed Firebase rules.
    // timerSeconds and the room deadline carry the actual 3–60 second duration.
    timerDuration: Math.max(10, timerSeconds)
  };
  const playerUpdates = {};
  Object.keys(players).forEach(uid => {
    playerUpdates[`players/${uid}/ready`] = false;
    playerUpdates[`players/${uid}/locked`] = false;
  });
  startingRound = true;
  try {
  if (roomMeta.visibility === 'public') await remove(ref(db, `publicRooms/${roomCode}`));
  await update(ref(db, roomPath()), {
    ...playerUpdates,
    settings,
    'meta/phase': 'aiming',
    'meta/round': round,
    [`meta/roundHistory/${round}`]: {
      round, target: selectedTarget, mode: settings.mode, matchStartRound: roomMeta.matchStartRound || 0,
      players: Object.fromEntries(Object.entries(players).filter(([,player]) => (player.eligibleRound || 1) <= round).map(([uid,player]) => [uid, {name:player.name,colorIndex:player.colorIndex}]))
    },
    'meta/startedAt': Date.now() + serverTimeOffset,
    'meta/deadline': timerEnabled ? Date.now() + serverTimeOffset + timerSeconds * 1000 : null,
    'meta/lastActiveAt': Date.now()
  });
  } finally { startingRound = false; }
}

async function handlePhase() {
  if (!['aiming', 'revealed'].includes(roomMeta.phase) || preparedRound === roomMeta.round || !players[user.uid]) return;
  if ((players[user.uid]?.eligibleRound || 1) > roomMeta.round) {
    show(panel); show(lobby); hide(entry); hide(resultsPanel);
    roomMessage.textContent = 'Round in progress. You will join the next one.';
    return;
  }
  preparedRound = roomMeta.round;
  const round = roomMeta.round;
  const [settingsSnapshot, targetSnapshot] = await Promise.all([
    get(ref(db, roomPath('settings'))), get(ref(db, roomPath('target')))
  ]);
  const settings = settingsSnapshot.val();
  if (!targetSnapshot.val()) { preparedRound = null; return; }
  await window.BussoleHome?.accessReady();
  if (leaving || !roomCode || roomMeta.round !== round || !['aiming', 'revealed'].includes(roomMeta.phase)) { preparedRound = null; return; }
  const parameters = new URLSearchParams({ integrated: '1', multiplayer: '1', room: displayCode(roomCode), mode: settings?.mode || 'medium' });
  window.location.replace(`globe-prototype.html?${parameters}`);
}

async function markReady() {
  if (!roomCode || roomMeta?.phase !== 'aiming') return;
  await update(ref(db, roomPath(`players/${user.uid}`)), { ready: true });
}

async function submitLine(submission) {
  if (!roomCode || roomMeta?.phase !== 'aiming' || players[user.uid]?.locked) return;
  const changes = { [`submissions/${roomMeta.round}/${user.uid}`]: { ...submission, submittedAt: serverTimestamp() } };
  if (roomMeta.visibility === 'public') {
    changes[`publicResults/${roomMeta.round}/${user.uid}`] = window.BussoleGame.publicResult(submission, selectedTarget, roomSettings.mode);
  }
  // Atomic write: an older rule set cannot save the location without also
  // accepting the reduced result. Public submissions are owner-readable only.
  await update(ref(db, roomPath()), changes);
  await update(ref(db, roomPath(`players/${user.uid}`)), { locked: true, ready: true });
}

async function maybeReveal() {
  if (!isHost() || roomMeta?.phase !== 'aiming') return;
  const active = Object.values(players).filter(player => player.connected && (player.eligibleRound || 1) <= roomMeta.round);
  if (active.length && active.every(player => player.locked)) await revealRound();
}

async function revealRound() {
  if (!isHost() || roomMeta?.phase !== 'aiming') return;
  await update(ref(db, roomPath('meta')), { phase: 'revealed', revealedAt: serverTimestamp(), lastActiveAt: serverTimestamp() });
}

async function showResults(submissions) {
  const settings = (await get(ref(db, roomPath('settings')))).val();
  const target = (await get(ref(db, roomPath('target')))).val();
  const publicRoom = roomMeta.visibility === 'public';
  const ownSubmission = publicRoom ? (await get(ref(db, roomPath(`submissions/${roomMeta.round}/${user.uid}`)))).val() : null;
  const entries = Object.entries(players).filter(([, player]) => (player.eligibleRound || 1) <= roomMeta.round).map(([uid, player]) => ({
    uid,
    name: player.name,
    color: COLOURS[player.colorIndex],
    errorColor: ERROR_COLOURS[player.colorIndex],
    submission: publicRoom ? (uid === user.uid ? ownSubmission : null) : submissions[uid] || null,
    publicResult: publicRoom ? submissions[uid] || null : null
  }));
  const round = roomMeta.round;
  const results = window.BussoleGame.revealMultiplayer(entries, target, settings.mode);
  const ranking = window.BussoleScoring.rank(results, players, round);
  await Promise.all(ranking.filter(result => isHost() || result.uid === user.uid).map(result =>
    runTransaction(ref(db, roomPath(`players/${result.uid}`)), player =>
      window.BussoleScoring.record(player, round, result.points)
    )
  ));
  const finished = window.BussoleScoring.outcome(ranking, settings.scoreGoal).length > 0;
  byId('roundResultsTitle').textContent = finished ? 'Match results' : 'Round results';
  byId('matchOutcome').textContent = window.BussoleScoring.matchMessage(ranking, settings.scoreGoal);
  byId('nextRoundBtn').textContent = finished ? 'Next Match' : 'Next round';
  byId('roundRanking').innerHTML = '';
  (finished ? ranking : window.BussoleScoring.roundRanking(ranking)).forEach(result => {
    const item = document.createElement('li');
    item.style.color = result.color;
    const error = result.errorMeters === null ? ' · DNF' : result.errorMeters === undefined ? '' : result.errorMeters >= 1000 ? ` · ${(result.errorMeters / 1000).toFixed(1)} km` : ` · ${Math.round(result.errorMeters)} m`;
    item.textContent = `${result.name} — ${result.points} pts${error} · Total: ${result.totalPoints} pts`;
    byId('roundRanking').appendChild(item);
  });
  openResultsPanel();
}

function setResultsCollapsed(collapsed) {
  roomBadge.classList.toggle('results-collapsed', collapsed);
  if (collapsed) {
    roomBadge.setAttribute('role', 'button');
    roomBadge.setAttribute('tabindex', '0');
    roomBadge.setAttribute('aria-label', 'Show round results');
  } else {
    roomBadge.removeAttribute('role');
    roomBadge.removeAttribute('tabindex');
    roomBadge.removeAttribute('aria-label');
  }
}

function openResultsPanel() {
  if (!roomCode || roomMeta?.phase !== 'revealed') return;
  show(panel); hide(lobby); hide(entry); show(resultsPanel);
  panel.classList.remove('lobby-mode');
  panel.classList.add('results-mode');
  setCloseButtonMode('close');
  show(roomBadge);
  if (selectedTarget) show(roomTargetBanner);
  setResultsCollapsed(false);
}

function closeResultsPanel() {
  if (!roomCode || roomMeta?.phase !== 'revealed' || resultsPanel.classList.contains('hidden')) return false;
  hide(panel);
  setResultsCollapsed(true);
  return true;
}

async function nextRound() {
  if (!isHost()) return;
  if (roomMeta?.phase !== 'revealed') return;
  const newMatch = window.BussoleScoring.outcome(
    window.BussoleScoring.standings(players), roomSettings.scoreGoal
  ).length > 0;
  const updates = window.BussoleScoring.lobbyUpdates(players, roomMeta.round, newMatch);
  updates.target = window.BussoleRoundTargets.next(selectedTarget);
  updates['meta/lastActiveAt'] = serverTimestamp();
  await update(ref(db, roomPath()), updates);
  window.BussoleGame.resetMultiplayerRound();
  document.body.classList.remove('multiplayer-round');
}

async function selectRandomTarget() {
  const catalogue = window.BUSSOLE_TARGETS || [];
  if (!catalogue.length) return;
  const target = catalogue[Math.floor(Math.random() * catalogue.length)];
  await saveTarget({ lat: target.lat, lon: target.lon, label: `${target.name}, ${target.country}` });
}

async function searchTarget() {
  const query = byId('roomTargetInput').value.trim();
  if (!query) return;
  const surprise = window.BussoleRoundTargets.searchEasterEgg(query);
  if (surprise) {
    await saveTarget(surprise);
    roomMessage.textContent = 'Target selected. Ready to start.';
    return;
  }
  roomMessage.textContent = 'Searching…';
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'en' } });
  const matches = await response.json();
  if (!matches.length) return void (roomMessage.textContent = 'Target not found.');
  await saveTarget({ lat: Number(matches[0].lat), lon: Number(matches[0].lon), label: matches[0].display_name });
  roomMessage.textContent = 'Target selected. Ready to start.';
}

async function saveTarget(target) {
  if (!isHost()) return;
  selectedTarget = target;
  await set(ref(db, roomPath('target')), target);
}

async function changeName() {
  if (matchStarted() || roomMeta?.phase !== 'lobby') return;
  const name = playerNameInput.value.trim().slice(0, 24);
  if (name && roomCode) await set(ref(db, roomPath(`players/${user.uid}/name`)), name);
}

async function copyRoomLink() {
  if (!roomCode) return;
  const inviteUrl = new URL(location.pathname, location.origin);
  inviteUrl.searchParams.set('room', displayCode(roomCode));
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteUrl.href);
    } else {
      const temporaryInput = document.createElement('textarea');
      temporaryInput.value = inviteUrl.href;
      temporaryInput.setAttribute('readonly', '');
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand('copy');
      temporaryInput.remove();
    }
    roomMessage.textContent = 'Invitation link copied.';
    setTimeout(() => {
      if (roomCode && roomMeta?.phase === 'lobby') renderRoom();
    }, 1800);
  } catch {
    roomMessage.textContent = 'Could not copy the link. Please try again.';
  }
}

async function leaveRoom() {
  if (leaving) return;
  leaving = true;
  countdown.stop();
  const previousCode = roomCode;
  const previousUserId = user?.uid;
  const previousDisconnectHandle = disconnectHandle;
  const shouldCloseRoom = !Object.entries(players).some(([uid, player]) =>
    uid !== previousUserId && isPlayerOnline(player)
  );
  clearTimeout(timerHandle);
  clearInterval(directoryTimer);
  directoryTimer = null;
  window.BussoleExplorers.close();
  if (isHost() && roomMeta?.visibility === 'public') {
    await Promise.race([
      remove(ref(db, `publicRooms/${previousCode}`)).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);
  }
  clearTimeout(presenceUiTimer);
  clearTimeout(hostTransferTimer);
  presenceUiTimer = null;
  hostTransferTimer = null;
  subscriptions.forEach(unsubscribe => unsubscribe());
  subscriptions = [];
  if (revealSubscription) revealSubscription();
  revealSubscription = null;
  disconnectHandle = null;
  databaseConnected = false;
  roomCode = null; roomMeta = null; players = {}; selectedTarget = null;
  preparedRound = null; revealedRound = null;
  byId('roomTargetInput').value = '';
  renderLobbyTarget();
  byId('startRoomRound').disabled = true;
  hide(panel); hide(roomBadge); hide(roomTargetBanner); hide(lobby); hide(resultsPanel); show(entry);
  roomTargetBanner.textContent = '';
  panel.classList.remove('results-mode', 'lobby-mode');
  setCloseButtonMode('close');
  setResultsCollapsed(false);
  document.body.classList.remove('multiplayer-round');
  show(menu);
  window.BussoleGame.returnToMenu();
  // Mark this seat offline before reloading. If the network is suspended, keep
  // the onDisconnect handler armed so Firebase performs the same cleanup.
  let presenceSaved = false;
  if (previousCode && previousUserId) {
    presenceSaved = await Promise.race([
      update(ref(db, `rooms/${previousCode}/players/${previousUserId}`), {
        connected: false,
        lastSeenAt: 0
      }).then(() => true).catch(() => false),
      new Promise(resolve => setTimeout(() => resolve(false), 700))
    ]);
  }
  if (presenceSaved && previousDisconnectHandle) {
    await previousDisconnectHandle.cancel().catch(() => {});
  }
  if (presenceSaved && shouldCloseRoom && previousCode) {
    await Promise.race([
      update(ref(db, `rooms/${previousCode}/meta`), {
        phase: 'closed',
        lastActiveAt: serverTimestamp()
      }).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);
  }
  window.location.replace(new URL('./', window.location.href).href);
}

function friendlyError(error) {
  console.error(error);
  if (error?.code === 'auth/operation-not-allowed') return 'Anonymous access is not enabled yet.';
  if (error?.code === 'PERMISSION_DENIED') return 'Firebase security rules are not installed yet.';
  return error?.message || 'Something went wrong.';
}

byId('multiplayerBtn').addEventListener('click', () => {
  hide(menu); show(panel); show(entry);
  panel.classList.remove('lobby-mode', 'results-mode');
  setCloseButtonMode('close');
});
closeButton.addEventListener('click', () => {
  if (closeResultsPanel()) return;
  roomCode ? leaveRoom() : (hide(panel), show(menu));
});
byId('createRoomBtn').addEventListener('click', () => createRoom('private'));
byId('createPublicRoomBtn').addEventListener('click', () => createRoom('public'));
byId('joinPublicRoomBtn').addEventListener('click', joinPublicRoom);
byId('explorerClose').addEventListener('click', () => window.BussoleExplorers.close());
byId('explorerDialog').addEventListener('click', event => {
  if (event.target === byId('explorerDialog')) {
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) window.BussoleExplorers.close();
  }
});
byId('showJoinRoomBtn').addEventListener('click', () => {
  show(byId('joinRoomForm'));
  byId('roomCodeInput').focus();
});
byId('roomCodeInput').addEventListener('input', event => { event.target.value = displayCode(compactCode(event.target.value)); });
byId('joinRoomBtn').addEventListener('click', joinRoom);
byId('roomTargetSearch').addEventListener('click', searchTarget);
byId('roomTargetRandom').addEventListener('click', selectRandomTarget);
byId('startRoomRound').addEventListener('click', () => startRound().catch(error => { roomMessage.textContent = friendlyError(error); }));
byId('copyRoomLinkBtn').addEventListener('click', copyRoomLink);
timerEnabledInput.addEventListener('change', updateTimerSettingsVisibility);
byId('roomTimerDuration').addEventListener('input', validateTimer);
byId('roomScoreGoal').addEventListener('change', async event => {
  if (!isHost() || roomMeta?.phase !== 'lobby' || matchStarted()) return;
  if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
  await set(ref(db, roomPath('settings/scoreGoal')), window.BussoleScoring.goal(event.target.value));
});
for (const id of ['roomMode', 'roomTimerEnabled', 'roomTimerDuration', 'roomBlurEnabled']) {
  byId(id).addEventListener('change', async () => {
    if (!isHost() || roomMeta?.phase !== 'lobby' || matchStarted() || (timerEnabledInput.checked && !validateTimer())) return;
    await update(ref(db, roomPath('settings')), {
      mode: byId('roomMode').value, mapStyle: '3d',
      timerEnabled: timerEnabledInput.checked,
      timerSeconds: window.BussoleRoundTimer.validDuration(byId('roomTimerDuration').value) ? Number(byId('roomTimerDuration').value) : 60,
      timerDuration: Math.max(10, Number(byId('roomTimerDuration').value) || 60),
      blurEnabled: Boolean(byId('roomBlurEnabled').checked)
    });
    maybeAutoStart();
  });
}
byId('resultsLeaveBtn').addEventListener('click', leaveRoom);
byId('nextRoundBtn').addEventListener('click', nextRound);
roomBadge.addEventListener('click', openResultsPanel);
roomBadge.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openResultsPanel();
  }
});
playerNameInput.addEventListener('change', changeName);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshPresence();
});
window.addEventListener('pageshow', refreshPresence);
window.addEventListener('focus', refreshPresence);
window.addEventListener('online', refreshPresence);

window.BussoleGame.registerMultiplayer({
  isActive: () => Boolean(roomCode),
  markReady,
  submitLine,
  leaveRoom
});

onAuthStateChanged(auth, current => { user = current; });
const invitedCode = compactCode(pageParameters.get('room') || '');
if (invitedCode.length === 6) {
  byId('roomCodeInput').value = displayCode(invitedCode);
  hide(menu); show(panel);
  if (resumeRequested) {
    hide(entry);
    joinRoom();
  } else {
    show(entry); show(byId('joinRoomForm'));
    setCloseButtonMode('close');
  }
}
