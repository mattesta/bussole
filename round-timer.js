// Shared solo and multiplayer clock, measured against a deadline.
window.BussoleRoundTimer = {
  validDuration(value) {
    const seconds = Number(value);
    return Number.isInteger(seconds) && seconds >= 3 && seconds <= 60;
  },
  duration(settings) {
    const value = settings.timerSeconds ?? settings.timerDuration;
    return this.validDuration(value) ? Number(value) : 60;
  },
  create(element, anchor, now = () => Date.now(), onExpire = () => {}) {
    let interval;
    let deadline;
    let expired = false;
    const stop = () => {
      clearInterval(interval);
      interval = null;
      element.classList.add('hidden');
    };
    const tick = () => {
      const remaining = Math.max(0, deadline - now());
      const seconds = Math.ceil(remaining / 1000);
      element.textContent = `${seconds} s`;
      element.classList.toggle('urgent', seconds < 5);
      element.setAttribute('aria-label', `${Math.ceil(remaining / 1000)} seconds remaining`);
      element.style.top = `${Math.max(12, anchor.getBoundingClientRect().bottom + 8)}px`;
      if (!remaining && !expired) {
        expired = true;
        clearInterval(interval);
        interval = null;
        onExpire();
      }
    };
    return {
      sync(meta) {
        if (meta?.phase !== 'aiming' || !Number.isFinite(meta.deadline)) return stop();
        if (deadline === meta.deadline && interval) return;
        stop();
        deadline = meta.deadline;
        expired = false;
        element.classList.remove('hidden');
        interval = setInterval(tick, 200);
        tick();
      },
      stop
    };
  }
};
