import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getDatabase, get, onDisconnect, onValue, ref, remove,
  runTransaction, serverTimestamp, set, update
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const EXPLORERS = [
  'Magellan', 'Zheng He', 'Nellie Bly', 'Ibn Battuta',
  'Sacagawea', 'Cook', 'Amundsen', 'Gertrude Bell'
];
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

let user = null;
let roomCode = null;
let roomMeta = null;
let players = {};
let selectedTarget = null;
let preparedRound = null;
let revealedRound = null;
let scoredRound = null;
let disconnectHandle = null;
let subscriptions = [];
let revealSubscription = null;
let timerHandle = null;
let leaving = false;
let presenceRefreshPromise = null;
let presenceUiTimer = null;
let hostTransferTimer = null;

function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }
function isHost() { return roomMeta && user && roomMeta.hostId === user.uid; }
function roomPath(suffix = '') { return `rooms/${roomCode}${suffix ? `/${suffix}` : ''}`; }
function isPlayerOnline(player) {
  if (player?.connected !== false) return true;
  const lastSeenAt = Number(player?.lastSeenAt) || 0;
  return lastSeenAt > 0 && Date.now() - lastSeenAt < PRESENCE_GRACE_MS;
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
}

async function refreshPresence() {
  if (!roomCode || !user || leaving) return;
  if (presenceRefreshPromise) return presenceRefreshPromise;
  const activeCode = roomCode;
  const activeUserId = user.uid;
  presenceRefreshPromise = (async () => {
    if (disconnectHandle) await disconnectHandle.cancel().catch(() => {});
    if (roomCode !== activeCode || leaving) return;
    const playerRef = ref(db, `rooms/${activeCode}/players/${activeUserId}`);
    disconnectHandle = onDisconnect(playerRef);
    await disconnectHandle.update({ connected: false, lastSeenAt: serverTimestamp() });
    if (roomCode === activeCode && !leaving) {
      await update(playerRef, { connected: true, lastSeenAt: serverTimestamp() });
    }
  })().catch(error => console.warn('Could not refresh multiplayer presence.', error))
    .finally(() => { presenceRefreshPromise = null; });
  return presenceRefreshPromise;
}

async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

function playerTemplate(index, eligibleRound = 1) {
  return {
    name: EXPLORERS[index] || `Explorer ${index + 1}`,
    colorIndex: index,
    connected: true,
    joinedAt: Date.now(),
    ready: false,
    locked: false,
    wins: 0,
    eligibleRound
  };
}

async function createRoom() {
  try {
    user = await ensureUser();
    let code;
    for (let attempt = 0; attempt < 8; attempt++) {
      code = makeCode();
      const roomRef = ref(db, `rooms/${code}`);
      const existing = await get(ref(db, `rooms/${code}/meta`));
      if (existing.exists()) { code = null; continue; }
      await set(roomRef, {
        meta: { hostId: user.uid, phase: 'lobby', round: 0, createdAt: Date.now(), lastActiveAt: Date.now() },
        settings: { mode: 'medium', timerEnabled: false, timerDuration: 60 },
        players: { [user.uid]: playerTemplate(randomIndex(MAX_PLAYERS), 1) }
      });
      break;
    }
    if (!code) throw new Error('Could not create a unique room.');
    await enterRoom(code);
  } catch (error) {
    roomMessage.textContent = friendlyError(error);
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
    if (!currentPlayers[user.uid] && Object.keys(currentPlayers).length >= MAX_PLAYERS) {
      throw new Error('This room is full.');
    }
    if (!currentPlayers[user.uid]) {
      const used = new Set(Object.values(currentPlayers).map(player => player.colorIndex));
      const available = [...Array(MAX_PLAYERS).keys()].filter(candidate => !used.has(candidate));
      const index = available[randomIndex(available.length)] ?? 0;
      await set(ref(db, `rooms/${code}/players/${user.uid}`), playerTemplate(index, (joinedMeta.round || 0) + 1));
    }
    await enterRoom(code);
  } catch (error) {
    roomMessage.textContent = friendlyError(error);
  }
}

async function enterRoom(code) {
  roomCode = code;
  leaving = false;
  hide(entry); show(lobby); hide(resultsPanel);
  panel.classList.add('lobby-mode');
  panel.classList.remove('results-mode');
  setCloseButtonMode('leave');
  byId('roomCodeLabel').textContent = displayCode(code);
  hide(roomBadge);
  history.replaceState(null, '', `${location.pathname}?room=${displayCode(code)}`);

  subscriptions.push(onValue(ref(db, '.info/connected'), snapshot => {
    if (snapshot.val() === true) refreshPresence();
  }));
  await refreshPresence();

  subscriptions.push(onValue(ref(db, roomPath('meta')), snapshot => {
    roomMeta = snapshot.val();
    if (!roomMeta) return leaveRoom();
    renderRoom();
    handlePhase();
  }));
  subscriptions.push(onValue(ref(db, roomPath('players')), snapshot => {
    players = snapshot.val() || {};
    renderPlayers();
    tryHostTransfer();
    maybeReveal();
    handlePhase();
  }));
  subscriptions.push(onValue(ref(db, roomPath('settings')), snapshot => {
    const settings = snapshot.val();
    if (!settings) return;
    byId('roomMode').value = settings.mode || 'medium';
    byId('roomTimerEnabled').checked = Boolean(settings.timerEnabled);
    byId('roomTimerDuration').value = settings.timerDuration || 60;
    updateTimerSettingsVisibility();
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
    byId('startRoomRound').disabled = !selectedTarget;
  }));
}

function renderRoom() {
  const host = isHost();
  host ? show(hostControls) : hide(hostControls);
  byId('nextRoundBtn').classList.toggle('hidden', !host);
  if (roomMeta.phase === 'lobby') {
    setResultsCollapsed(false);
    panel.classList.remove('results-mode');
    panel.classList.add('lobby-mode');
    setCloseButtonMode('leave');
    show(panel); show(lobby); hide(entry); hide(resultsPanel);
    hide(roomBadge);
    hide(roomTargetBanner);
    roomMessage.textContent = host ? 'Choose a target, then start the round.' : 'Waiting for the host to start…';
  }
}

function renderPlayers() {
  clearTimeout(presenceUiTimer);
  presenceUiTimer = null;
  roomPlayers.innerHTML = '';
  const list = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  let nextPresenceExpiry = Infinity;
  list.forEach(([uid, player]) => {
    const item = document.createElement('li');
    item.className = 'room-player';
    item.innerHTML = `<span class="player-colour" style="background:${COLOURS[player.colorIndex]}"></span><span></span><span class="player-state"></span>`;
    item.children[1].textContent = `${player.name}${uid === roomMeta?.hostId ? ' ★' : ''} · ${player.wins || 0} wins`;
    const spectator = roomMeta?.phase === 'aiming' && (player.eligibleRound || 1) > roomMeta.round;
    const online = isPlayerOnline(player);
    item.children[2].textContent = !online ? 'offline' : spectator ? 'next round' : player.locked ? 'locked' : player.ready ? 'aiming' : 'Ready';
    if (player.connected === false && online) {
      nextPresenceExpiry = Math.min(
        nextPresenceExpiry,
        PRESENCE_GRACE_MS - (Date.now() - Number(player.lastSeenAt))
      );
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
  if (!isHost() || !selectedTarget) return;
  const round = (roomMeta.round || 0) + 1;
  const timerEnabled = byId('roomTimerEnabled').checked;
  const timerDuration = Math.max(10, Number(byId('roomTimerDuration').value) || 60);
  const settings = { mode: byId('roomMode').value, timerEnabled, timerDuration };
  const playerUpdates = {};
  Object.keys(players).forEach(uid => {
    playerUpdates[`players/${uid}/ready`] = false;
    playerUpdates[`players/${uid}/locked`] = false;
  });
  await update(ref(db, roomPath()), {
    ...playerUpdates,
    settings,
    'meta/phase': 'aiming',
    'meta/round': round,
    'meta/startedAt': Date.now(),
    'meta/deadline': timerEnabled ? Date.now() + timerDuration * 1000 : null,
    'meta/lastActiveAt': Date.now()
  });
}

async function handlePhase() {
  if (roomMeta.phase === 'aiming' && preparedRound !== roomMeta.round) {
    if (!players[user.uid]) return;
    if ((players[user.uid]?.eligibleRound || 1) > roomMeta.round) {
      show(panel); show(lobby); hide(entry); hide(resultsPanel);
      roomMessage.textContent = 'Round in progress. You will join the next one.';
      return;
    }
    preparedRound = roomMeta.round;
    revealedRound = null;
    panel.classList.remove('lobby-mode');
    hide(panel);
    show(roomBadge);
    if (selectedTarget) show(roomTargetBanner);
    document.body.classList.add('multiplayer-round');
    const settings = (await get(ref(db, roomPath('settings')))).val();
    const target = (await get(ref(db, roomPath('target')))).val();
    window.BussoleGame.prepareMultiplayerRound(settings, target);
    if (isHost() && roomMeta.deadline) {
      clearTimeout(timerHandle);
      timerHandle = setTimeout(() => revealRound(), Math.max(0, roomMeta.deadline - Date.now()));
    }
  }
  if (roomMeta.phase === 'revealed' && revealedRound !== roomMeta.round) {
    revealedRound = roomMeta.round;
    clearTimeout(timerHandle);
    if (revealSubscription) revealSubscription();
    revealSubscription = onValue(ref(db, roomPath(`submissions/${roomMeta.round}`)), snapshot => {
      showResults(snapshot.val() || {});
    }, { onlyOnce: true });
  }
}

async function markReady() {
  if (!roomCode || roomMeta?.phase !== 'aiming') return;
  await update(ref(db, roomPath(`players/${user.uid}`)), { ready: true });
}

async function submitLine(submission) {
  if (!roomCode || roomMeta?.phase !== 'aiming' || players[user.uid]?.locked) return;
  await set(ref(db, roomPath(`submissions/${roomMeta.round}/${user.uid}`)), {
    ...submission,
    submittedAt: serverTimestamp()
  });
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
  const entries = Object.entries(players).filter(([, player]) => (player.eligibleRound || 1) <= roomMeta.round).map(([uid, player]) => ({
    uid,
    name: player.name,
    color: COLOURS[player.colorIndex],
    errorColor: ERROR_COLOURS[player.colorIndex],
    wins: player.wins || 0,
    submission: submissions[uid] || null
  }));
  const ranking = window.BussoleGame.revealMultiplayer(entries, target, settings.mode);
  byId('roundRanking').innerHTML = '';
  ranking.forEach(result => {
    const item = document.createElement('li');
    item.style.color = result.color;
    const error = result.errorMeters === null ? 'DNF' : result.errorMeters >= 1000 ? `${(result.errorMeters / 1000).toFixed(1)} km` : `${Math.round(result.errorMeters)} m`;
    item.textContent = `${result.name} — ${error}`;
    byId('roundRanking').appendChild(item);
  });
  openResultsPanel();
  if (isHost() && scoredRound !== roomMeta.round && Number.isFinite(ranking[0]?.errorMeters)) {
    scoredRound = roomMeta.round;
    const winner = ranking[0].uid;
    await runTransaction(ref(db, roomPath(`players/${winner}/wins`)), value => (value || 0) + 1);
  }
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
  await update(ref(db, roomPath('meta')), { phase: 'lobby', deadline: null, lastActiveAt: serverTimestamp() });
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
  const previousCode = roomCode;
  const previousUserId = user?.uid;
  const previousDisconnectHandle = disconnectHandle;
  clearTimeout(timerHandle);
  clearTimeout(presenceUiTimer);
  clearTimeout(hostTransferTimer);
  presenceUiTimer = null;
  hostTransferTimer = null;
  subscriptions.forEach(unsubscribe => unsubscribe());
  subscriptions = [];
  if (revealSubscription) revealSubscription();
  revealSubscription = null;
  disconnectHandle = null;
  roomCode = null; roomMeta = null; players = {}; selectedTarget = null;
  preparedRound = null; revealedRound = null; scoredRound = null;
  byId('roomTargetInput').value = '';
  byId('startRoomRound').disabled = true;
  hide(panel); hide(roomBadge); hide(roomTargetBanner); hide(lobby); hide(resultsPanel); show(entry);
  roomTargetBanner.textContent = '';
  panel.classList.remove('results-mode', 'lobby-mode');
  setCloseButtonMode('close');
  setResultsCollapsed(false);
  document.body.classList.remove('multiplayer-round');
  history.replaceState(null, '', location.pathname);
  window.BussoleGame.returnToMenu();

  // Navigation should never wait for a slow or suspended mobile connection.
  if (previousDisconnectHandle) await previousDisconnectHandle.cancel().catch(() => {});
  if (previousCode && previousUserId) {
    await update(ref(db, `rooms/${previousCode}/players/${previousUserId}`), {
      connected: false,
      lastSeenAt: 0
    }).catch(() => {});
  }
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
byId('createRoomBtn').addEventListener('click', createRoom);
byId('showJoinRoomBtn').addEventListener('click', () => show(byId('joinRoomForm')));
byId('roomCodeInput').addEventListener('input', event => { event.target.value = displayCode(compactCode(event.target.value)); });
byId('joinRoomBtn').addEventListener('click', joinRoom);
byId('roomTargetSearch').addEventListener('click', searchTarget);
byId('roomTargetRandom').addEventListener('click', selectRandomTarget);
byId('startRoomRound').addEventListener('click', startRound);
byId('copyRoomLinkBtn').addEventListener('click', copyRoomLink);
timerEnabledInput.addEventListener('change', updateTimerSettingsVisibility);
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
const invitedCode = compactCode(new URLSearchParams(location.search).get('room') || '');
if (invitedCode.length === 6) {
  byId('roomCodeInput').value = displayCode(invitedCode);
  hide(menu); show(panel); show(entry); show(byId('joinRoomForm'));
  setCloseButtonMode('close');
}
