# Privacy and room cleanup

The code no longer sends starting positions, headings, distances or guess routes to Firebase. Both public and private rooms share points only. Best-shot geometry stays in the owner's browser; it is not synced across devices. Scores, destination labels, account information and normalized statistics remain accessible to Firebase administrators. Do not promise that the operator cannot access all personal data.

## Required production rollout

1. Publish the complete `database.rules.json`. Old clients will stop submitting geometry; refresh/reopen the app. Old rooms are intentionally incompatible.
2. Run the one-time migration below. Rules do not erase existing data.
3. Deploy the current site. Do not describe historical data as erased before step 2 succeeds.

## One-time purge of existing cloud geometry

Use a trusted computer with Node 22+ and the Firebase project owner's Application Default Credentials. Keep credentials outside the repository. Never put an Admin credential in GitHub Actions or send it in chat.

Install `firebase-admin` locally (or use the project's existing development installation), then run:

```sh
node room-maintenance/migrate.cjs
node room-maintenance/migrate.cjs --apply
```

The first command reports counts only. `--apply` deletes all legacy rooms (including active legacy sessions) and strips geometry from old account highlights, preserving points/destination metadata and scalar account statistics. It does not export or log coordinates, names or account IDs. Transactions preserve concurrently upgraded v2 rooms/records. Run again to verify zero legacy records. This does not delete copies in exports, provider backups or another person's browser. Review any backups separately before making a deletion claim.

The account screen opportunistically copies its owner's legacy replay geometry into that browser before stripping the cloud fields. An owner-wide purge cannot preserve old replays on every user's device; old cloud replays not already migrated will become unavailable.

## Automatic cleanup of abandoned rooms, without paid Firebase services

Normal Leave room deletes an empty room using a transaction that rechecks the latest participants. New matches remove the previous match's scores and target history. Each new room has an immutable expiry no more than 24 hours away. Rules block expired access even without a scheduler. Closing the browser abruptly cannot guarantee immediate physical deletion.

For physical deletion of abandoned rooms, use the included hourly public-repository GitHub Actions workflow:

1. In Firebase Authentication, add a dedicated email/password service user with a long random password (or reuse the existing dedicated reminder sender). Do not use your personal account or an Admin credential.
2. In Firebase Realtime Database, set `roomMaintenanceConfig/uid` to that service user's UID. This configuration is console-only; clients cannot edit it.
3. In GitHub → repository Settings → Secrets and variables → Actions, add `BUSSOLE_ROOM_CLEANUP_SECRET` containing only:

```json
{"email":"YOUR_SERVICE_USER_EMAIL","password":"YOUR_RANDOM_PASSWORD"}
```

4. Run **Free expired-room cleanup** once from Actions. No Functions, Cloud Scheduler, Firebase billing upgrade or third-party service is required. The workflow skips when the secret is absent. It processes up to 100 expired rooms per run; rerun for a larger backlog. Scheduling is best effort and may be delayed or disabled by GitHub inactivity rules.

The service identity can read the restricted timestamp index and delete expired rooms/listings. It cannot read whole rooms, guesses, account statistics or highlights, create rooms, alter expiry or delete live rooms. The expiration index is registered atomically with room creation, and is not a browsable directory for ordinary players.

## Verification

Use the Auth/Database emulators. `scripts/test_room_privacy_rules.cjs` tests raw-upload rejection, nested-field rejection, old clients, score visibility, room expiry, atomic indexing and cleaner isolation. The browser account suite verifies local replay, cloud-free geometry, export, migration and deletion. Maintenance tests cover dry-run/apply migration and deletion behavior.
