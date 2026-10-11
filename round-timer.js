// Shared multiplayer clock: the deadline belongs to the room, not a local decrement.
window.BussoleRoundTimer = {
  validDuration(value) {
    const seconds = Number(value);
    return Number.isInteger(seconds) && seconds >= 3 && seconds <= 60;
  },
  duration(settings) {
    const value = settings.timerSeconds ?? settings.timerDuration;
    return this.validDuration(value) ? Number(value) : 60;
  },
  create(element, anchor, now = () => Date.now()) {
    let interval;
    let deadline;
    const stop = () => {
      clearInterval(interval);
      interval = null;
      element.classList.add('hidden');
    };
    const tick = () => {
      const remaining = Math.max(0, deadline - now());
      element.textContent = `${Math.ceil(remaining / 1000)}s`;
      element.classList.toggle('urgent', remaining < 10000);
      element.setAttribute('aria-label', `${Math.ceil(remaining / 1000)} seconds remaining`);
      element.style.top = `${Math.max(12, anchor.getBoundingClientRect().bottom + 8)}px`;
      if (!remaining) clearInterval(interval);
    };
    return {
      sync(meta) {
        if (meta?.phase !== 'aiming' || !Number.isFinite(meta.deadline)) return stop();
        if (deadline === meta.deadline && interval) return;
        stop();
        deadline = meta.deadline;
        element.classList.remove('hidden');
        tick();
        interval = setInterval(tick, 200);
      },
      stop
    };
  }
};
