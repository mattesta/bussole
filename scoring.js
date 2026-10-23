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
  roundRanking(ranking) {
    return [...ranking].sort((a, b) => b.points - a.points || b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  },
  goal(value) {
    const goal = Number(value);
    return Number.isSafeInteger(goal) && goal > 0 ? goal : 5000;
  },
  standings(players) {
    return Object.entries(players).map(([uid, player]) => ({
      ...player, uid, totalPoints: this.total(player.roundScores)
    })).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  },
  outcome(ranking, goal) {
    const highest = Math.max(0, ...ranking.map(player => player.totalPoints));
    return highest >= this.goal(goal)
      ? ranking.filter(player => player.totalPoints === highest) : [];
  },
  matchMessage(ranking, goal) {
    const winners = this.outcome(ranking, goal);
    if (!winners.length) return `First to ${this.goal(goal)} points.`;
    return winners.length === 1
      ? `${winners[0].name} wins with ${winners[0].totalPoints} points!`
      : `Draw: ${winners.map(player => player.name).join(' & ')} — ${winners[0].totalPoints} points!`;
  },
  lobbyUpdates(players, round, newMatch) {
    const updates = { 'meta/phase': 'lobby', 'meta/deadline': null };
    if (newMatch) {
      // Keep round IDs increasing so old submissions can never reappear.
      updates['meta/matchStartRound'] = round;
      updates['meta/roundHistory'] = null;
      updates.publicResults = null;
      updates.target = null;
    }
    Object.keys(players).forEach(uid => {
      updates[`players/${uid}/ready`] = false;
      updates[`players/${uid}/locked`] = false;
      if (newMatch) {
        updates[`players/${uid}/roundScores`] = null;
        updates[`players/${uid}/totalPoints`] = 0;
        updates[`players/${uid}/wins`] = 0;
        updates[`players/${uid}/eligibleRound`] = round + 1;
      }
    });
    return updates;
  },
  record(player, round, points) {
    if (!player || Object.hasOwn(player.roundScores || {}, round)) return;
    const roundScores = { ...(player.roundScores || {}), [round]: points };
    return { ...player, roundScores, totalPoints: this.total(roundScores) };
  }
};
