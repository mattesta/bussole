import {deleteEmptyRoom} from './room-cleanup.js?v=1';
import {saveGuess, guess, clearMatch} from './private-geometry.js?v=1';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getDatabase, get, onDisconnect, onValue, ref, runTransaction,
  serverTimestamp, set, update
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';
import { beginRound, saveSample } from './account-service.js?v=9';

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
  const nextRoundButton = document.getElementById('globeNextRoundBtn');
  const roomBadge = document.getElementById('globeRoomBadge');
  const roomProgress = document.getElementById('globeRoomProgress');
  const homeLink = document.getElementById('prototypeBackLink');
  const summaryActions = document.getElementById('globeSummaryActions');
  const personalSummary = document.getElementById('globePersonalSummary');
  const summaryStatus = document.getElementById('globeSummaryStatus');
  const summaryFrame = document.getElementById('matchSummaryFrame');
  let matchReport = null;
  let resultsReady = false;
  let advancingRound = false;
  let accountRound = Promise.resolve(null);

  let serverTimeOffset = 0;
  const countdown = window.BussoleRoundTimer.create(document.getElementById('globeCountdown'), document.querySelector('.target-card'), () => Date.now() + serverTimeOffset, () => {}, element => window.BussoleMobileLayout.positionTimer(element));
  let user;
  let roomMeta;
  let settings;
  let target;
  let players = {};
  let disconnectHandle;
  let presenceRefreshPromise = null;
  let presenceRefreshQueued = false;
  let presenceReady = false;
  let databaseConnected = false;
  let timerHandle;
  let shownRound = null;
  let leaving = false;
  let hostTransferTimer;
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
    if (!user || leaving || !presenceReady || roomMeta?.phase === 'closed') return;
    if (presenceRefreshPromise) { presenceRefreshQueued = true; return presenceRefreshPromise; }
    const activeUserId = user.uid;
    let saved = false;
    presenceRefreshPromise = (async () => {
      const playerRef = ref(db, roomPath(`players/${activeUserId}`));
      // Re-arming the same path replaces its disconnect update. Cancelling
      // first can stall recovery while the previous connection is suspended.
      disconnectHandle = onDisconnect(playerRef);
      await disconnectHandle.update({ connected: false, lastSeenAt: serverTimestamp() });
      if (!leaving && user?.uid === activeUserId && roomMeta?.phase !== 'closed') {
        await update(playerRef, { connected: true, lastSeenAt: serverTimestamp(), ready: true });
        saved = true;
      }
    })().catch(error => {
      console.warn('Could not refresh multiplayer presence.', error);
      window.BussoleGlobe.setStatus('Could not reconnect to the room. Check your connection, then retry.');
    }).finally(() => {
      presenceRefreshPromise = null;
      const retry = presenceRefreshQueued;
      presenceRefreshQueued = false;
      if (saved && retry && !leaving && databaseConnected && document.visibilityState === 'visible' &&
          players[user?.uid]?.connected === false && Number(players[user.uid].lastSeenAt) > 0) refreshPresence();
    });
    return presenceRefreshPromise;
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
      saveGuess(user.uid, roomCode, roomMeta.createdAt, roomMeta.round, submission);
      const result = window.BussoleGlobe.publicResult(submission, target, settings.mode || 'medium');
      // Deliberate allowlist: never send coordinates, headings, distances or routes.
      await set(ref(db, roomPath(`publicResults/${roomMeta.round}/${user.uid}`)), {version:1,points:result.points});
      await update(ref(db, roomPath(`players/${user.uid}`)), { locked: true, ready: true });
      window.BussoleGlobe.setStatus('Line locked. Waiting for the other explorers…');
    } catch (error) {
      console.error(error);
      window.BussoleGlobe.setGoEnabled(true);
      window.BussoleGlobe.setStatus('The line could not be saved. Please try again.');
    }
  }

  async function tryHostTransfer() {
    clearTimeout(hostTransferTimer);
    if (!roomMeta || roomMeta.phase === 'closed' || players[roomMeta.hostId]?.connected !== false) return;
    const host = players[roomMeta.hostId];
    if (window.BussolePublicRooms.online(host, Date.now() + serverTimeOffset)) {
      hostTransferTimer = setTimeout(tryHostTransfer, Math.max(250, 30100 - (Date.now() + serverTimeOffset - Number(host.lastSeenAt))));
      return;
    }
    const successor = Object.entries(players).filter(([, player]) => player.connected).sort((a, b) => a[1].joinedAt - b[1].joinedAt)[0];
    if (successor?.[0] === user.uid) {
      await runTransaction(ref(db, roomPath('meta/hostId')), current => current === roomMeta.hostId ? user.uid : undefined);
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
    countdown.stop();
    const publicRoom = true; // Every room keeps guesses on the player's device.
    const resultPath = 'publicResults';
    const snapshot = await get(ref(db, roomPath(`${resultPath}/${roomMeta.round}`)));
    const submissions = snapshot.val() || {};
    const ownSubmission = guess(user.uid, roomCode, roomMeta.createdAt, roomMeta.round);
    const entries = Object.entries(players)
      .filter(([, player]) => (player.eligibleRound || 1) <= roomMeta.round)
      .map(([uid, player]) => ({
        uid,
        name: player.name,
        color: COLOURS[player.colorIndex],
        errorColor: ERROR_COLOURS[player.colorIndex],
        submission: uid === user.uid ? ownSubmission : null,
        publicResult: submissions[uid] || null
      }));
    const round = roomMeta.round;
    const results = window.BussoleGlobe.revealMultiplayer(entries, target, settings.mode || 'medium');
    const ranking = window.BussoleScoring.rank(results, players, round);
    const personal = entries.find(entry => entry.uid === user.uid)?.submission;
    if (personal) {
      // Scalar errors and the owner's private Pro highlights are saved separately.
      const personalTarget = {...target}, personalMode = settings.mode || 'medium';
      const recordKey = `${roomCode}:${roomMeta.createdAt}:${round}`;
      accountRound.then(context => {
        if (!context) return false;
        const measured = window.BussoleReportGeometry.measure(personal, personalTarget, personalMode);
        const sample = window.BussoleAccountStatistics.sample(measured, personal, personalMode, 'multiplayer');
        return saveSample(context, sample, recordKey, {submission:personal,target:personalTarget});
      })
        .then(saved => { if(saved)document.getElementById('accountSaveStatus').textContent = 'Statistics saved on this device.'; })
        .catch(error => { document.getElementById('accountSaveStatus').textContent = error.message || 'Statistics could not be saved on this device.'; });
    }
    await Promise.all(ranking.filter(result => isHost() || result.uid === user.uid).map(result =>
      runTransaction(ref(db, roomPath(`players/${result.uid}`)), player =>
        window.BussoleScoring.record(player, round, result.points)
      )
    ));
    const finished = window.BussoleScoring.outcome(ranking, settings.scoreGoal).length > 0;
    document.getElementById('globeResultsTitle').textContent = finished ? 'Match results' : '';
    document.getElementById('globeResultsTitle').classList.toggle('hidden', !finished);
    document.getElementById('globeMatchOutcome').textContent = finished ? window.BussoleScoring.matchMessage(ranking, settings.scoreGoal) : '';
    document.getElementById('globeMatchOutcome').classList.toggle('hidden', !finished);
    nextRoundButton.textContent = finished ? 'Next Match' : 'Next round';
    rankingList.replaceChildren();
    (finished ? ranking : window.BussoleScoring.roundRanking(ranking)).forEach(result => {
      const item = document.createElement('li');
      item.style.color = result.color;
      const error = result.errorMeters === null
        ? ' · DNF'
        : result.errorMeters === undefined ? ''
        : result.errorMeters >= 1000
          ? ` · ${(result.errorMeters / 1000).toFixed(1)} km`
          : ` · ${Math.round(result.errorMeters)} m`;
      item.textContent = `${result.name} — ${result.points} pts${error} · Total: ${result.totalPoints} pts`;
      rankingList.appendChild(item);
    });
    resultsReady = true;
    updateNextRoundState();
    roomBadge.classList.remove('results-available');
    show(resultsPanel);
    summaryActions.classList.toggle('hidden', !finished);
    personalSummary.classList.toggle('hidden', !finished);
    if (finished) await prepareReport();
  }

  let reportLoading = null;
  function updateNextRoundState() {
    show(nextRoundButton);
    nextRoundButton.disabled = !isHost() || roomMeta?.phase !== 'revealed' || !resultsReady || Boolean(reportLoading) || advancingRound;
    nextRoundButton.title = isHost() ? 'Continue to the next round' : 'Waiting for the host to continue';
  }
  function dismissResults() {
    if (roomMeta?.phase !== 'revealed') return;
    hide(resultsPanel);
    roomBadge.classList.add('results-available');
  }
  function prepareReport() {
    if (reportLoading) return reportLoading;
    const publicRoom = true; // Every room keeps guesses on the player's device.
    personalSummary.disabled = true;
    summaryStatus.textContent = 'Preparing your match summary…';
    nextRoundButton.disabled = true;
    reportLoading = (async () => {
      try {
        matchReport = await window.BussoleMatchReport.load({
          publicRoom, uid: user.uid, meta: structuredClone(roomMeta), target, settings, players,
          readOwnGuess: round => guess(user.uid, roomCode, roomMeta.createdAt, round)
        });
        window.BussoleMatchReport.save(matchReport, displayCode(roomCode));
        summaryStatus.textContent = 'Your guesses stay on this device. Other players share scores only.';
      } catch (error) {
        console.warn('Match summary unavailable.', error.code || error.message);
        summaryStatus.textContent = 'Summary unavailable. Tap Summary to retry.';
      } finally {
        personalSummary.disabled = false;
        reportLoading = null; updateNextRoundState();
      }
    })();
    return reportLoading;
  }

  function openSummary(view) {
    if (!matchReport || (view === 'room' && matchReport.publicRoom)) return;
    hide(resultsPanel);
    summaryFrame.src = `match-summary.html?embedded=1&view=${view}`;
    show(summaryFrame);
  }
  personalSummary.addEventListener('click', async () => { if (!matchReport) await prepareReport(); openSummary('personal'); });
  summaryFrame.addEventListener('load', () => {
    if (matchReport) summaryFrame.contentWindow.postMessage({type:'bussole-match-report', report:{...matchReport,roomCode:displayCode(roomCode)}}, location.origin);
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== summaryFrame.contentWindow) return;
    if (event.data?.type === 'bussole-summary-close') {
      hide(summaryFrame); summaryFrame.src = 'about:blank'; show(resultsPanel);
    } else if (event.data?.type === 'bussole-summary-home') leaveRoom();
  });

  async function nextRound() {
    if (!isHost() || advancingRound) return;
    if (roomMeta?.phase !== 'revealed') return;
    const newMatch = window.BussoleScoring.outcome(
      window.BussoleScoring.standings(players), settings.scoreGoal
    ).length > 0;
    const changes = window.BussoleScoring.lobbyUpdates(players, roomMeta.round, newMatch);
    if(newMatch)clearMatch(user.uid,roomCode,roomMeta.createdAt);
    changes.target = window.BussoleRoundTargets.next(target);
    changes['meta/lastActiveAt'] = serverTimestamp();
    advancingRound = true; updateNextRoundState();
    try { await update(ref(db, roomPath()), changes); }
    catch (error) {
      advancingRound = false; updateNextRoundState();
      window.BussoleGlobe.setStatus('Could not start the next round. Please retry.');
    }
  }

  async function leaveRoom() {
    if (leaving) return;
    leaving = true;
    countdown.stop();
    clearTimeout(timerHandle);
    clearTimeout(hostTransferTimer);
    unsubscribers.forEach(unsubscribe => unsubscribe());
    const otherOnlinePlayers = Object.entries(players).some(([uid, player]) =>
      uid !== user?.uid && window.BussolePublicRooms.online(player, Date.now() + serverTimeOffset)
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
        deleteEmptyRoom(db,roomCode,user.uid,roomMeta.createdAt,Date.now()+serverTimeOffset).catch(()=>false),
        new Promise(resolve=>setTimeout(resolve,1000))
      ]);
    }
    clearMatch(user.uid,roomCode,roomMeta.createdAt);
    goHome();
  }

  async function initialize() {
    if (roomCode.length !== 6) return goHome();
    try {
      user = await ensureUser();
      // Firebase rules grant access to each room section, not to the room root.
      // Reading the whole room at once therefore fails even for valid players.
      const [metaSnapshot, settingsSnapshot, targetSnapshot, playersSnapshot] = await Promise.all([
        get(ref(db, roomPath('meta'))),
        get(ref(db, roomPath('settings'))),
        get(ref(db, roomPath('target'))),
        get(ref(db, roomPath('players')))
      ]);
      roomMeta = metaSnapshot.val();
      settings = settingsSnapshot.val() || { mode: 'medium' };
      target = targetSnapshot.val();
      players = playersSnapshot.val() || {};
      if (!roomMeta || roomMeta.schemaVersion !== 2 || roomMeta.expiresAt <= Date.now()+serverTimeOffset || roomMeta.phase === 'closed' || !players[user.uid]) return goHome();
      if (!target) return goHome();
      if (roomMeta.phase === 'aiming') accountRound = beginRound();

      window.BussoleGlobe.registerMultiplayer({ isActive: () => true, submitLine, dismissResults });
      updateNextRoundState();
      window.BussoleGlobe.setBlurEnabled(settings.blurEnabled);
      window.BussoleGlobe.setMultiplayerTarget(target);
      presenceReady = true;
      unsubscribers.push(onValue(ref(db, '.info/connected'), snapshot => {
        databaseConnected = snapshot.val() === true;
        if (databaseConnected) refreshPresence();
      }));
      await refreshPresence();
      updateProgress();
      window.BussoleGlobe.setStatus(`Room ${displayCode(roomCode)} · Aim, then press Go!`);

      unsubscribers.push(onValue(ref(db, roomPath('players')), playerSnapshot => {
        players = playerSnapshot.val() || {};
        if (databaseConnected && document.visibilityState === 'visible' &&
            players[user?.uid]?.connected === false && Number(players[user.uid].lastSeenAt) > 0) refreshPresence();
        countdown.sync(roomMeta);
        updateProgress();
        tryHostTransfer();
        maybeReveal();
      }));
      unsubscribers.push(onValue(ref(db, roomPath('target')), targetSnapshot => {
        target = targetSnapshot.val();
        if (target && roomMeta?.phase !== 'revealed') {
          window.BussoleGlobe.setMultiplayerTarget(target);
        }
      }));
      unsubscribers.push(onValue(ref(db, '.info/serverTimeOffset'), snapshot => { serverTimeOffset = Number(snapshot.val()) || 0; }));
      unsubscribers.push(onValue(ref(db, roomPath('settings')), settingsSnapshot => {
        settings = settingsSnapshot.val() || settings;
        window.BussoleGlobe.setBlurEnabled(settings.blurEnabled);
      }));
      unsubscribers.push(onValue(ref(db, roomPath('meta')), metaSnapshot => {
        const previousPhase = roomMeta?.phase;
        roomMeta = metaSnapshot.val();
        if (!roomMeta || roomMeta.phase === 'closed') return goHome();
        countdown.sync(roomMeta);
        updateProgress();
        updateNextRoundState();
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
          }, Math.max(0, roomMeta.deadline - (Date.now() + serverTimeOffset)));
        }
      }));
      if (roomMeta.phase === 'revealed') showResults();
    } catch (error) {
      console.error(error);
      window.BussoleGlobe.setStatus('The multiplayer room is unavailable. Returning Home…');
      setTimeout(goHome, 900);
    }
  }

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
