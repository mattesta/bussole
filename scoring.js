// Shared by both map renderers and multiplayer controllers.
window.BussoleScoring = {
  points(errorMeters, distanceMeters) {
    if (!Number.isFinite(errorMeters) || !Number.isFinite(distanceMeters)) return 0;
    if (distanceMeters <= 0) return errorMeters <= 0 ? 1000 : 0;
    return Math.round(1000 * Math.max(0, Math.min(1, 1 - errorMeters / distanceMeters)));
  },
  total(roundScores = {}) {
    return Object.values(roundScores).reduce((sum, points) => sum + points, 0);
  },
  rank(results, players, round) {
    return results.map(result => {
      const roundScores = { ...(players[result.uid]?.roundScores || {}), [round]: result.points || 0 };
      return { ...result, totalPoints: this.total(roundScores) };
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.points - a.points || a.name.localeCompare(b.name));
  },
  record(player, round, points) {
    if (!player || Object.hasOwn(player.roundScores || {}, round)) return;
    const roundScores = { ...(player.roundScores || {}), [round]: points };
    return { ...player, roundScores, totalPoints: this.total(roundScores) };
  }
};
