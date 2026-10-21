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
  let soloType=null,dailyController=null;
  function chooseSolo(type) {
    dailyController?.leave();
    soloType=type;
    byId('soloPlayChoice').classList.add('hidden');byId('soloSettings').classList.remove('hidden');
    const game=type==='game',daily=type==='daily';
    byId('soloConfigControls').classList.toggle('hidden',daily);byId('dailyDetails').classList.toggle('hidden',!daily);byId('dailyComparison').classList.add('hidden');
    byId('soloSettingsTitle').textContent=daily?'Daily Challenge':game?'Game · 5 rounds':'Practice';
    byId('soloDescription').textContent=daily?'The same 5 targets for everyone. Normal · 30 s timer. A new challenge at 00:00 UTC.':game?'5 random targets. No skips. Up to 5,000 points.':'Choose any target, search for a place or try a random one. Play as many rounds as you like.';
    byId('soloRecordNote').classList.toggle('hidden',!game);
    byId('startSoloBtn').textContent=daily?'Loading…':game?'Start game':'Start practice';
    validateTimer();
    if(daily){byId('startSoloBtn').disabled=true;byId('dailyInfo').textContent='Loading today’s challenge…';dailyController?.prepare();}
  }
  byId('soloGameBtn').addEventListener('click',()=>chooseSolo('game'));
  byId('soloDailyBtn').addEventListener('click',()=>chooseSolo('daily'));
  byId('soloPracticeBtn').addEventListener('click',()=>chooseSolo('practice'));
  byId('singlePlayerBack').addEventListener('click', () => {
    if(soloType){dailyController?.leave();soloType=null;byId('soloSettings').classList.add('hidden');byId('soloPlayChoice').classList.remove('hidden');return;}
    byId('singlePlayerPanel').classList.add('hidden');byId('homePlayChoice').classList.remove('hidden');
  });

  function validateTimer() {
    const valid = window.BussoleRoundTimer.validDuration(duration.value);
    duration.classList.toggle('invalid',timer.checked&&!valid);
    duration.setAttribute('aria-invalid', String(timer.checked && !valid));
    if(soloType!=='daily')byId('startSoloBtn').disabled=launching||(timer.checked&&!valid);
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

  byId('startSoloBtn').addEventListener('click', async () => {
    if (launching||!soloType) return;
    if(soloType==='daily'){
      if(!dailyController)return;
      launching=true;byId('startSoloBtn').disabled=true;byId('launchStatus').textContent='Requesting location and compass access…';
      try{await dailyController.launch(prepareAccess());}catch(error){launching=false;byId('launchStatus').textContent=error.message;byId('startSoloBtn').disabled=false;}
      return;
    }
    if (timer.checked && !validateTimer()) { duration.focus(); return; }
    const parameters = new URLSearchParams({ mode: byId('soloMode').value, integrated: '1', solo:soloType });
    if (timer.checked) parameters.set('timer', duration.value);
    if (byId('blurCheckbox').checked) parameters.set('blur', '1');
    launching = true;
    byId('startSoloBtn').disabled = true;
    byId('launchStatus').textContent = 'Requesting location and compass access…';
    await prepareAccess();
    window.location.href = `globe-prototype.html?${parameters}`;
  });
  for (const id of ['multiplayerBtn','createRoomBtn','createPublicRoomBtn','joinRoomBtn','joinPublicRoomBtn']) {
    byId(id).addEventListener('click', prepareAccess);
  }
  timer.addEventListener('change', () => {
    byId('timerSettings').classList.toggle('hidden',!timer.checked);
    validateTimer();
  });
  duration.addEventListener('input', validateTimer);
  window.BussoleHome = { prepareAccess, soloType:()=>soloType, registerDaily(controller){dailyController=controller;if(soloType==='daily')controller.prepare();}, accessReady: () => accessPromise || Promise.resolve() };
  // Lobby cleanup hooks; no map or sensors are running on the home page.
  window.BussoleGame = {
    registerMultiplayer() {}, resetMultiplayerRound() {},
    returnToMenu() { byId('menu').style.display = ''; }
  };
})();
