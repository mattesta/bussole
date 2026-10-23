import {ref, get, runTransaction, remove} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
// Use the server's current room, not the UI's possibly stale player list.
export async function deleteEmptyRoom(db, code, uid, createdAt, now) {
  // Transactions may initially run with null if this room root was never read.
  await get(ref(db, `rooms/${code}`));
  const result = await runTransaction(ref(db, `rooms/${code}`), room => {
    if (!room) return null; // Let the SDK retry with server data before deleting.
    if (room.meta?.createdAt !== createdAt || !room.players?.[uid]) return;
    const anotherOnline = Object.entries(room.players).some(([id, player]) =>
      id !== uid && (player.connected !== false || Number(player.lastSeenAt) > now - 30000)
    );
    if (anotherOnline) return;
    return null;
  }, {applyLocally:false});
  if (result.committed) {
    await Promise.allSettled([
      remove(ref(db, `publicRooms/${code}`)),
      remove(ref(db, `roomExpirations/${code}`))
    ]);
  }
  return result.committed;
}
