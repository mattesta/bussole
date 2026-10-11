window.BussolePublicRooms = {
  maxPlayers: 8,
  grace: 30000,
  directoryLifetime: 60000,
  online(player, now = Date.now()) {
    return player?.connected === true || (player?.connected === false && Number(player.lastSeenAt) > 0 && now - player.lastSeenAt < this.grace);
  },
  candidates(directory, now = Date.now()) {
    return Object.entries(directory || {}).filter(([code, entry]) =>
      /^[A-Z]{6}$/.test(code) && entry.phase === 'lobby' && entry.count > 0 && entry.count < this.maxPlayers &&
      now - entry.updatedAt < this.directoryLifetime && entry.updatedAt <= now + 5000
    ).sort((a, b) => b[1].count - a[1].count || a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]));
  },
  canClaim(owner, uid, players, now = Date.now()) {
    if (!owner || owner.uid === uid) return true;
    const player = players[owner.uid];
    // A newly claimed seat is held while its player record is being written.
    return player ? !this.online(player, now) : now - Number(owner.claimedAt) >= this.grace;
  },
  waiting(meta) {
    return meta?.phase === 'lobby' && meta.round === (meta.matchStartRound || 0);
  },
  shouldAutoStart(meta, players, now = Date.now()) {
    // Later rounds keep their intermission until the host starts them.
    return meta?.visibility === 'public' && this.waiting(meta) && Object.values(players).filter(player => this.online(player, now)).length === this.maxPlayers;
  },
  summary(settings) {
    const map = settings.mapStyle === '3d' ? '3D Globe' : '2D Map';
    const mode = { easy: 'Easy', medium: 'Normal', hard: 'Hard' }[settings.mode] || 'Normal';
    const timer = settings.timerEnabled ? `${window.BussoleRoundTimer.duration(settings)} s timer` : 'No timer';
    return `${map} · ${mode} · ${timer} · ${window.BussoleScoring.goal(settings.scoreGoal)} points to win${settings.blurEnabled ? ' · Blur on' : ''}`;
  }
};
