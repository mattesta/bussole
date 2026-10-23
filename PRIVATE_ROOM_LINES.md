# Private room lines without readable cloud geometry

Private multiplayer shows the other room participants’ starting locations and full lines after reveal. Public multiplayer remains score-only. The lobby tells players that private participants share their starting locations and lines. Anyone knowing the private room code can join within the existing room limits; the code does not establish that they are a friend.

## Scope of protection

A passive reader of Firebase data, including a project administrator using the console or a database export, receives public exchange keys, encrypted line messages and ordinary scores/targets. The secret keys are absent from Firebase, URLs, account statistics and exports. Database contents alone do not decrypt the line messages. Code changes or ordinary account sign-in on another device cannot recover the old keys from Firebase.

This is not a promise against every possible location inference from scores/targets, a compromised participant device, malicious room participants or an operator actively replacing the website or public keys. The current Firebase-mediated key exchange has no independently authenticated identity verification or out-of-band fingerprint ceremony. Rules make a participant's public key immutable for that round, but privileged administrators can bypass rules. Do not claim protection against an active malicious operator or audited end-to-end identity security. The operator sees positions if they participate in that room, just like other participants. Participants can retain screenshots or device copies; software cannot recall those.

## Protocol and retention

Each account/room/round/tab generates a random P-256 ECDH key pair using Web Crypto. Only the raw public key is published. The private key is kept in sessionStorage so navigation/reload in the original tab works. Each peer pair derives a secret via ECDH and HKDF-SHA-256, with room identity as salt and an application-specific context. AES-256-GCM encrypts each canonical guess separately for each recipient with a fresh random 96-bit nonce. Authenticated associated data binds protocol version, room, creation timestamp, round, sender and recipient. Only lat, lon, heading and distanceMeters are encrypted; arbitrary submission fields are discarded. Decryption validates geometry bounds.

Messages are uploaded only after the round is revealed. A listener handles late public-key registration, so a recipient opening slightly later can receive the current round. Players that never open the game, close it before reveal or lose their original tab keys may have scores without a shared line. Failed crypto/storage/exchange shows an error and never falls back to readable geometry. Public rooms never open this channel.

Firebase paths are rooms/CODE/lineKeys/ROUND/UID (public string only) and rooms/CODE/sealedLines/ROUND/SENDER/RECIPIENT (version, iv, data only). Rules restrict the channel to private room participants, disallow changing registered public keys, bind sender writes to authentication and require the current revealed round. Plaintext and extra fields are rejected. The host deletes all encrypted messages and public exchange keys when advancing to the next round, including Next Match. Room expiry and hourly deletion also apply. Each player's secret key is removed on explicit Leave, account sign-out or account deletion, pruned after 24 hours, and otherwise follows the browser's tab-storage lifecycle, including browser session restore behavior. A second tab without the original key cannot replace that round’s registered key and falls back to scores with a visible explanation. The next round uses new keys, allowing normal line sharing to resume.

Received lines remain in memory for the current globe view only. They are not saved into account error statistics, Pro highlights, exports or match summaries. Personal guesses remain in existing device-local match storage and personal summaries. Room secret keys are not backup/synchronization material.

## Rollout and validation

Publish the full current database.rules.json before deploying this version. The additional lineKeys/sealedLines rules are needed even if the prior device-only statistics rules were already published. No billing, Cloud Functions, STUN/TURN service or external relay is added. The existing Firebase room retention/cleanup covers ciphertext; its dedicated cleaner cannot decipher lines.

scripts/test_private_room_crypto.cjs exercises real cryptography, peer and room isolation, tampering, replay context, nonces, reload, forgetting keys and blocked storage. scripts/test_private_room_channel_ui.cjs uses independent mobile browser contexts, real SDK/Auth/Database emulators and actual Web Crypto for two-way line exchange, late key registration, reload, cloud ciphertext projection, outsider denial, plaintext rejection, immutable keys, round deletion and public exclusion. Existing room/account/game suites check regressions.

Implementation references: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits ; https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey ; https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt . This implementation has not had an independent security audit.
