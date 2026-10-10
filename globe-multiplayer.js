import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getDatabase, get, onDisconnect, onValue, ref, runTransaction,
  serverTimestamp, set, update
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const parameters = new URLSearchParams(location.search);
const multiplayerMode = parameters.get('multiplayer') === '1';

if (multiplayerMode) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const roomCode = (parameters.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  const COLOURS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#00a6a6', '#f781bf', '#6b4c2a'];
  const ERROR_COLOURS = ['#ff8587', '#86c5f4', '#92dc8f', '#d29ddd', '#ffc06a', '#70dada', '#ffc0df', '#b99a78'];
  const resultsPanel = document.getElementById('globeMultiplayerResults');
  const rankingList = document.getElementById('globeRoundRanking');
  const resultsClose = document.getElementById('globeResultsClose');
  const nextRoundButton = document.getElementById('globeNextRoundBtn');
  const roomBadge = document.getElementById('globeRoomBadge');
  const roomProgress = document.getElementById('globeRoomProgress');
  const homeLink = document.getElementById('prototypeBackLink');

  let user;
  let roomMeta;
  let settings;
  let target;
  let players = {};
  let disconnectHandle;
  let timerHandle;
  let shownRound = null;
  let scoredRound = null;
  let leaving = false;
  const unsubscribers = [];

  const roomPath = suffix => `rooms/${roomCode}${suffix ? `/${suffix}` : ''}`;
  const isHost = () => user && roomMeta?.hostId === user.uid;
  const show = element => element.classList.remove('hidden');
  const hide = element => element.classList.add('hidden');
  const displayCode = code => code.match(/.{1,2}/g)?.join('-') || code;

  function goHome() {
    location.replace(new URL('./', location.href).href);
  }

  async function ensureUser() {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
    return (await signInAnonymously(auth)).user;
  }

  async function refreshPresence() {
    if (!user || leaving) return;
    if (disconnectHandle) await disconnectHandle.cancel().catch(() => {});
    const playerRef = ref(db, roomPath(`players/${user.uid}`));
    disconnectHandle = onDisconnect(playerRef);
    await disconnectHandle.update({ connected: false, lastSeenAt: serverTimestamp() });
    await update(playerRef, { connected: true, lastSeenAt: serverTimestamp(), ready: true });
  }

  function updateProgress() {
    const eligible = Object.values(players).filter(player =>
      player.connected && (player.eligibleRound || 1) <= (roomMeta?.round || 0)
    );
    const locked = eligible.filter(player => player.locked).length;
    roomProgress.textContent = roomMeta?.phase === 'aiming'
      ? `${locked}/${eligible.length} locked`
      : `${eligible.length} explorers`;
    show(roomBadge);
  }

  async function submitLine(submission) {
    if (roomMeta?.phase !== 'aiming' || players[user.uid]?.locked) return;
    try {
      await set(ref(db, roomPath(`submissions/${roomMeta.round}/${user.uid}`)), {
        ...submission,
        submittedAt: serverTimestamp()
      });
      await update(ref(db, roomPath(`players/${user.uid}`)), { locked: true, ready: true });
      window.BussoleGlobe.setStatus('Line locked. Waiting for the other explorers…');
    } catch (error) {
      console.error(error);
      window.BussoleGlobe.setGoEnabled(true);
      window.BussoleGlobe.setStatus('The line could not be saved. Please try again.');
    }
  }

  async function maybeReveal() {
    if (!isHost() || roomMeta?.phase !== 'aiming') return;
    const active = Object.values(players).filter(player =>
      player.connected && (player.eligibleRound || 1) <= roomMeta.round
    );
    if (active.length && active.every(player => player.locked)) {
      await update(ref(db, roomPath('meta')), {
        phase: 'revealed',
        revealedAt: serverTimestamp(),
        lastActiveAt: serverTimestamp()
      });
    }
  }

  async function showResults() {
    if (!roomMeta || shownRound === roomMeta.round || !target || !settings) return;
    if (!window.BussoleGlobe.isReady()) {
      setTimeout(showResults, 120);
      return;
    }
    shownRound = roomMeta.round;
    clearTimeout(timerHandle);
    const snapshot = await get(ref(db, roomPath(`submissions/${roomMeta.round}`)));
    const submissions = snapshot.val() || {};
    const entries = Object.entries(players)
      .filter(([, player]) => (player.eligibleRound || 1) <= roomMeta.round)
      .map(([uid, player]) => ({
        uid,
        name: player.name,
        color: COLOURS[player.colorIndex],
        errorColor: ERROR_COLOURS[player.colorIndex],
        submission: submissions[uid] || null
      }));
    const ranking = window.BussoleGlobe.revealMultiplayer(entries, target, settings.mode || 'medium');
    rankingList.replaceChildren();
    ranking.forEach(result => {
      const item = document.createElement('li');
      item.style.color = result.color;
      const error = result.errorMeters === null
        ? 'DNF'
        : result.errorMeters >= 1000
          ? `${(result.errorMeters / 1000).toFixed(1)} km`
          : `${Math.round(result.errorMeters)} m`;
      item.textContent = `${result.name} — ${error}`;
      rankingList.appendChild(item);
    });
    nextRoundButton.classList.toggle('hidden', !isHost());
    roomBadge.classList.remove('results-available');
    show(resultsPanel);
    if (isHost() && scoredRound !== roomMeta.round && Number.isFinite(ranking[0]?.errorMeters)) {
      scoredRound = roomMeta.round;
      await runTransaction(
        ref(db, roomPath(`players/${ranking[0].uid}/wins`)),
        current => (current || 0) + 1
      );
    }
  }

  async function nextRound() {
    if (!isHost()) return;
    const changes = {
      'meta/phase': 'lobby',
      'meta/deadline': null,
      'meta/lastActiveAt': serverTimestamp()
    };
    Object.keys(players).forEach(uid => {
      changes[`players/${uid}/ready`] = false;
      changes[`players/${uid}/locked`] = false;
    });
    await update(ref(db, roomPath()), changes);
  }

  async function leaveRoom() {
    if (leaving) return;
    leaving = true;
    clearTimeout(timerHandle);
    unsubscribers.forEach(unsubscribe => unsubscribe());
    const otherOnlinePlayers = Object.entries(players).some(([uid, player]) =>
      uid !== user?.uid && player.connected
    );
    window.BussoleGlobe.setStatus('Leaving room…');
    const presenceSaved = await Promise.race([
      update(ref(db, roomPath(`players/${user.uid}`)), {
        connected: false,
        lastSeenAt: 0
      }).then(() => true).catch(() => false),
      new Promise(resolve => setTimeout(() => resolve(false), 700))
    ]);
    if (presenceSaved && disconnectHandle) {
      await disconnectHandle.cancel().catch(() => {});
    }
    if (presenceSaved && !otherOnlinePlayers) {
      await Promise.race([
        update(ref(db, roomPath('meta')), {
          phase: 'closed',
          lastActiveAt: serverTimestamp()
        }).catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
    }
    goHome();
  }

  async function initialize() {
    if (roomCode.length !== 6) return goHome();
    try {
      user = await ensureUser();
      const snapshot = await get(ref(db, roomPath()));
      const room = snapshot.val();
      if (!room?.meta || room.meta.phase === 'closed' || !room.players?.[user.uid]) return goHome();
      roomMeta = room.meta;
      settings = room.settings || { mode: 'medium' };
      target = room.target;
      players = room.players || {};
      if (settings.mapStyle !== '3d' || !target) return goHome();

      window.BussoleGlobe.registerMultiplayer({ isActive: () => true, submitLine });
      window.BussoleGlobe.setMultiplayerTarget(target);
      await refreshPresence();
      updateProgress();
      window.BussoleGlobe.setStatus(`Room ${displayCode(roomCode)} · Aim, then press Go!`);

      unsubscribers.push(onValue(ref(db, roomPath('players')), playerSnapshot => {
        players = playerSnapshot.val() || {};
        updateProgress();
        maybeReveal();
      }));
      unsubscribers.push(onValue(ref(db, roomPath('target')), targetSnapshot => {
        target = targetSnapshot.val();
        if (target && roomMeta?.phase !== 'revealed') {
          window.BussoleGlobe.setMultiplayerTarget(target);
        }
      }));
      unsubscribers.push(onValue(ref(db, roomPath('settings')), settingsSnapshot => {
        settings = settingsSnapshot.val() || settings;
      }));
      unsubscribers.push(onValue(ref(db, roomPath('meta')), metaSnapshot => {
        const previousPhase = roomMeta?.phase;
        roomMeta = metaSnapshot.val();
        if (!roomMeta || roomMeta.phase === 'closed') return goHome();
        updateProgress();
        if (roomMeta.phase === 'revealed') showResults();
        if (roomMeta.phase === 'lobby' && previousPhase !== 'lobby') {
          const lobbyUrl = new URL('./', location.href);
          lobbyUrl.searchParams.set('room', displayCode(roomCode));
          lobbyUrl.searchParams.set('resume', '1');
          location.replace(lobbyUrl.href);
        }
        if (isHost() && roomMeta.phase === 'aiming' && roomMeta.deadline) {
          clearTimeout(timerHandle);
          timerHandle = setTimeout(async () => {
            if (roomMeta?.phase === 'aiming') {
              await update(ref(db, roomPath('meta')), {
                phase: 'revealed',
                revealedAt: serverTimestamp(),
                lastActiveAt: serverTimestamp()
              });
            }
          }, Math.max(0, roomMeta.deadline - Date.now()));
        }
      }));
      if (roomMeta.phase === 'revealed') showResults();
    } catch (error) {
      console.error(error);
      window.BussoleGlobe.setStatus('The multiplayer room is unavailable. Returning Home…');
      setTimeout(goHome, 900);
    }
  }

  resultsClose.addEventListener('click', () => {
    hide(resultsPanel);
    roomBadge.classList.add('results-available');
  });
  roomBadge.addEventListener('click', () => {
    if (roomMeta?.phase === 'revealed') {
      roomBadge.classList.remove('results-available');
      show(resultsPanel);
    }
  });
  nextRoundButton.addEventListener('click', nextRound);
  homeLink.addEventListener('click', event => {
    event.preventDefault();
    leaveRoom();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshPresence();
  });
  window.addEventListener('pageshow', refreshPresence);
  window.addEventListener('focus', refreshPresence);
  window.addEventListener('online', refreshPresence);

  initialize();
}
