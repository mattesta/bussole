// Geometry stays in this browser. No network API belongs in this module.
import { BussoleLocalGeometry } from './private-geometry-store.js?v=1';
export const highlights = (uid, generation) => BussoleLocalGeometry.highlights(uid, generation);
export const saveHighlight = (uid, generation, shot) => BussoleLocalGeometry.saveHighlight(uid, generation, shot);
export const clearGeometry = uid => BussoleLocalGeometry.clear(uid);
export const saveGuess = (uid, room, createdAt, round, submission) => BussoleLocalGeometry.saveGuess(uid, room, createdAt, round, submission);
export const guess = (uid, room, createdAt, round) => BussoleLocalGeometry.guess(uid, room, createdAt, round);
export const clearMatch = (uid, room, createdAt) => BussoleLocalGeometry.clearMatch(uid, room, createdAt);
