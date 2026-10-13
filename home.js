// Home and permission hand-off. All games run on the globe page.
(function () {
  const byId = id => document.getElementById(id);
  const timer = byId('timerCheckbox'), duration = byId('timerDuration');
  let accessPromise;
  let launching = false;
  byId('singlePlayerBtn').addEventListener('click', () => {
    byId('homePlayChoice').classList.add('hidden');
    byId('singlePlayerPanel').classList.remove('hidden');
  });
  byId('singlePlayerBack').addEventListener('click', () => {
    byId('singlePlayerPanel').classList.add('hidden');
    byId('homePlayChoice').classList.remove('hidden');
  });

  function validateTimer() {
    const valid = window.BussoleRoundTimer.validDuration(duration.value);
    byId('soloTimerError').classList.toggle('hidden', !timer.checked || valid);
    duration.setAttribute('aria-invalid', String(timer.checked && !valid));
    return valid;
  }
  function prepareAccess() {
    if (accessPromise) return accessPromise;
    // Start the iOS permission request synchronously inside the player's tap.
    let orientation;
    try {
      orientation = typeof DeviceOrientationEvent === 'undefined' ? Promise.resolve(false)
        : typeof DeviceOrientationEvent.requestPermission === 'function'
          ? DeviceOrientationEvent.requestPermission(true).then(value => value === 'granted').catch(() => false)
          : Promise.resolve(true);
    } catch { orientation = Promise.resolve(false); }
    accessPromise = (async () => {
      const orientationGranted = await orientation;
      const coordinates = navigator.geolocation ? await new Promise(resolve => {
        try {
          navigator.geolocation.getCurrentPosition(
            position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            () => resolve(null), { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
          );
        } catch { resolve(null); }
      }) : null;
      const data = { coordinates, orientationGranted, acquiredAt: Date.now() };
      try { sessionStorage.setItem('bussoleGlobeLaunch', JSON.stringify(data)); } catch { /* The globe can request access again. */ }
      return data;
    })();
    accessPromise.then(data => {
      // Failed access must be retryable from the next user gesture.
      if (!data.coordinates || !data.orientationGranted) accessPromise = null;
    });
    return accessPromise;
  }

  document.querySelectorAll('.modeBtn').forEach(button => button.addEventListener('click', async () => {
    if (launching) return;
    if (timer.checked && !validateTimer()) { duration.focus(); return; }
    const parameters = new URLSearchParams({ mode: button.dataset.mode, integrated: '1' });
    if (timer.checked) parameters.set('timer', duration.value);
    if (byId('blurCheckbox').checked) parameters.set('blur', '1');
    launching = true;
    button.disabled = true;
    byId('launchStatus').textContent = 'Requesting location and compass access…';
    await prepareAccess();
    window.location.href = `globe-prototype.html?${parameters}`;
  }));
  for (const id of ['multiplayerBtn','createRoomBtn','createPublicRoomBtn','joinRoomBtn','joinPublicRoomBtn']) {
    byId(id).addEventListener('click', prepareAccess);
  }
  timer.addEventListener('change', () => {
    byId('timerSettings').style.display = timer.checked ? 'flex' : 'none';
    validateTimer();
  });
  duration.addEventListener('input', validateTimer);
  window.BussoleHome = { prepareAccess, accessReady: () => accessPromise || Promise.resolve() };
  // Lobby cleanup hooks; no map or sensors are running on the home page.
  window.BussoleGame = {
    registerMultiplayer() {}, resetMultiplayerRound() {},
    returnToMenu() { byId('menu').style.display = ''; }
  };
})();
