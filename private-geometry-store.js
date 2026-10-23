// Persistent highlights are scoped by account and statistics generation.
// Multiplayer guesses use tab storage, expire after 24 h, and never sync.
const PREFIX = 'bussole-private-geometry-v1:';
const memory = new Map();
function read(key, temporary = false) {
  if(memory.has(key))return memory.get(key);
  try { return JSON.parse((temporary ? sessionStorage : localStorage).getItem(key) || 'null'); }
  catch { return memory.get(key) || null; }
}
function write(key, value, temporary = false) {
  try { (temporary ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); memory.delete(key); return true; }
  catch { memory.set(key,value); return false; } // Unavailable storage must never trigger a cloud fallback.
}
function remove(key, temporary = false) {
  memory.delete(key);
  try { (temporary ? sessionStorage : localStorage).removeItem(key); } catch {}
}
const shotKey = uid => PREFIX + uid;
const matchKey = (uid, room, createdAt) => `${PREFIX}match:${uid}:${room}:${createdAt}`;
function highlights(uid, generation) {
  const value = read(shotKey(uid));
  return value?.generation === generation ? value.shots || {} : {};
}
function saveHighlight(uid, generation, shot) {
  const rows = {...highlights(uid, generation), [shot.sampleId]: shot};
  const chosen = window.BussoleAccountStatistics.bestShotEntries(rows);
  return write(shotKey(uid), {generation, shots: Object.fromEntries(chosen.map(row => [row.id, rows[row.id]]))});
}
function clearMatch(uid, room, createdAt) { remove(matchKey(uid, room, createdAt), true); }
function clear(uid) {
  remove(shotKey(uid));
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(`${PREFIX}match:${uid}:`)) remove(key, true);
  } catch {}
  for (const key of memory.keys()) if (key.startsWith(`${PREFIX}match:${uid}:`)) memory.delete(key);
  try { sessionStorage.removeItem('bussoleMatchReport'); } catch {}
}
function pruneMatches() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(`${PREFIX}match:`)) {
      const value = read(key, true);
      if (!value || Date.now() - value.savedAt > 86400000) remove(key, true);
    }
  } catch {}
}
function saveGuess(uid, room, createdAt, round, submission) {
  pruneMatches();
  const key = matchKey(uid, room, createdAt), old = read(key, true);
  const rounds = old && Date.now() - old.savedAt < 86400000 ? old.rounds || {} : {};
  rounds[round] = {...submission};
  return write(key, {savedAt: Date.now(), rounds}, true);
}
function guess(uid, room, createdAt, round) {
  const value = read(matchKey(uid, room, createdAt), true);
  return value && Date.now() - value.savedAt < 86400000 ? value.rounds?.[round] || null : null;
}
export const BussoleLocalGeometry = {highlights, saveHighlight, clear, saveGuess, guess, clearMatch};
