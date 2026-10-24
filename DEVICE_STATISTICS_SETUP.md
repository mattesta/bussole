# Device-only detailed statistics: production rollout

This release removes per-guess error history from Firebase and friends' snapshots. Personal charts read IndexedDB on the current device. Global error comparisons are disabled. Cloud score records, Daily participation, usernames, connections, optional kilometre rankings and minimal Pro points/destination records remain. Private rooms also relay public exchange keys and encrypted, temporary lines; see PRIVATE_ROOM_LINES.md. Those records are visible to project administrators; do not promise that no possible location inference can ever be made.

## Required order

1. Publish the **complete database.rules.json from this release** in Firebase → Realtime Database → Rules. Check that accountData/$uid/samples has `.validate: false` and profile has no communityConsent field. These rules reject all new detailed-error uploads, including from old clients, and block friends from opening legacy snapshots containing samples. Existing records are not automatically deleted.
2. Deploy/merge the site update. Refresh/reopen the app on each device. Old cached clients may fail saves under the stricter rules until refreshed.
3. On an account's usual device, open My account and check the personal charts. The app saves current-generation legacy samples locally before deleting the cloud history. Export my data to retain a copy. A device storage warning means migration has not completed: do not assume that cloud history was removed.
4. Purge remaining legacy data. For the current three-account installation, manual console cleanup is sufficient. Do not inspect or export other users' values. Deleting their old history without their device migration means those charts cannot be recovered from Firebase afterwards.

## Manual cleanup for the small installation

After the new site is live, for each UID under accountData:

- Remove the entire `samples` child if it remains. Do not delete the UID/accountData parent.
- Inspect only field names under `proShots`. Each saved row must contain only `sampleId`, `points`, `destination`, `generation`. Delete legacy extra fields (including all error and geometry fields). Alternatively delete the entire proShots child, which loses those old top-three cloud score records. Opening the account on the new site sanitizes these rows automatically.
- Remove legacy `profile/communityConsent` and `profile/consentVersion` if present. Keep username, preferences and generation.

Delete the roots `friendShares`, `communityStatistics` and `accountInternal` if present. Safe friend snapshots rebuild when their owners next sync; connections remain. Keep `soloBests`, `dailyAttempts`, `dailyScores`, profiles, connections, usernames and service configuration. In particular, keep roomMaintenanceConfig/uid and its service account: the working hourly room cleaner needs them.

Recheck that no account has samples and no Pro row contains errors/geometry, and that rebuilt friend snapshots have no samples. Rules block new uploads. Retain no private export from this check. Existing exports/provider backups/downloaded copies require separate handling; this procedure cannot remotely erase them.

## Optional owner script

For a larger installation, use room-maintenance/migrate.cjs with trusted owner Application Default Credentials, as described in PRIVACY_CLEANUP_SETUP.md. Dry-run first; --apply deletes cloud histories and shared histories, removes obsolete consent/aggregation state, sanitizes Pro metadata and deletes legacy rooms. It logs counts only. This is a destructive cloud purge, not a device migration. Never send credentials in chat or commit them.

No paid Firebase service or function deployment is required. If an old refreshCommunityStatistics function was deployed separately, delete that deployed function; source removal alone does not remove it. The room cleaner deliberately cannot read or purge account histories.

## Device limitations

Local errors and replay geometry do not sync. Clearing site data or browser eviction can remove them. Storage failures show an error and never fall back to cloud uploads. Statistics/account deletion clears the current device; other devices hide old generations on their next account refresh but existing physical copies cannot be erased remotely. Firebase Auth still uses its own local sign-in storage. This change addresses game error data, not every item of infrastructure metadata.

## Validation

Real Auth/Database emulator and mobile browser checks cover local persistence, legacy migration, cloud projection, outgoing database frames, a second browser with no private history/replay, blocked device storage with no cloud fallback, generation reset, export and deletion. Rules reject error fields in account samples, Pro metadata and friend snapshots; legacy friend histories are unreadable. The maintenance test covers count-only dry runs, full purge, preserved score metadata and idempotence.

## Move statistics to a new phone

On the old device, open My account → Export my data. Keep the JSON private: it includes locally available replay locations. On the new device, sign in to the same Bussole account, choose Import my data, select the file and review the preview before Restore on this device. Import merges local guesses and restores included Pro replays. Repeated imports do not duplicate the same records. Official personal-best scores, Daily participation/progress, friendships, preferences and rankings remain unchanged in Firebase. No new rules are required for importing.

New version-2 exports preserve sample/replay IDs and the account UID. Older version-1 exports are supported when the stored email matches the current account; because they lack IDs, merging uses sample-value occurrence counts and matches legacy replay metadata where possible. An old backup from before an email change needs a fresh export from the original device. After a statistics reset, a freshly selected backup can intentionally restore local history into the current generation; an already-open preview from before the reset is rejected. Device storage errors never trigger an upload fallback.

## Daily replay and friends update

Publish the complete current rules before deploying: mutually accepted friends gain only a read of the existing current-day official score (no duplicate cloud record) and the configured reminder sender gains only the current-day completion scalar for opted-in account reminders, not private attempts/history. New replays use a standalone summary page with local report transfer, preserving data when the globe fails. Daily replay is stored only on the playing device, scoped by account/generation/UTC day; later unranked games do not replace it. Previous Daily geometry that was never retained cannot be recovered after the old game page is closed. Pro rank markers refer to the highest three records, but cloud-only entries without local geometry cannot be plotted. Browser navigation tests use a map API facade, including simulated WebGL failure; real iPhone GPU behavior still needs a device check.
