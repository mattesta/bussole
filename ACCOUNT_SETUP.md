# Optional personal accounts

This prototype keeps guest gameplay and anonymous Firebase authentication. It adds email/password accounts, an optional editable display username and a preference to use it for new multiplayer seats. Usernames are display names and need not be unique; email is the login.

## Enable personal accounts

1. In Firebase project `bussole-game`, open **Authentication → Sign-in method → Email/Password**. Enable **Email/Password**, leaving email-link sign-in off. Keep **Anonymous** enabled.
2. Under Authentication settings, make sure **Authorized domains** includes `mattesta.github.io`. Set the password policy minimum to **8 characters**. Enable email enumeration protection if it is not already enabled.
3. Publish the complete updated `database.rules.json` in **Realtime Database → Rules**. Existing room rules are preserved; the additions are `accountData`, `communityStatistics` and `accountInternal`. Never use global public read/write rules.
4. Review Authentication's verification and password-reset email templates. The default Firebase action handler can be used. If the Google API key has HTTP referrer restrictions, allow the game's origin and the Firebase action-handler origin (`https://bussole-game.firebaseapp.com/*`) for authentication to finish. Do not remove API restrictions globally.
5. After the site update is published, open **Sign in → Create account**, verify the email, then press **I have verified**. Try a new single-player guess and open **My account**. Existing guest games are never imported.

Accounts, profile preferences and personal error statistics do not require deploying Cloud Functions. Community comparison remains unavailable until the server functions below are deployed and there are enough contributors. The app handles this independently of personal statistics.

## Data model and privacy

`accountData/{auth.uid}/profile`: `username`, `useInRooms`, `communityConsent` (default false), `consentVersion`, and an internal `generation` key.

`accountData/{auth.uid}/samples/{opaqueKey}`: UTC day number, difficulty, solo/multiplayer, points, relative final error, signed angular error, Pro signed relative distance error, plus the generation key. Undefined geometric measures are omitted. Sample payloads are explicitly projected to these fields on the client and validated by rules. Account history has **no starting coordinates, targets, routes, exact headings, room codes or round numbers**. Multiplayer keys are SHA-256 digests to make repeat saves idempotent without keeping room identities. Solo keys are random UUIDs.

Only the account owner can read/write their account branch. Samples and consent require verified password authentication; unverified users can still play. Samples are captured only for accounts verified at the start of the attempt. Guest identities are not linked to new registrations. DNF attempts are excluded. Registration/authentication and account controls are outside active gameplay.

Deleting statistics removes samples, opts out of community contributions and rotates the generation key atomically. Old games open in other tabs then fail rule validation instead of resurrecting deleted data. Deleting the account first reauthenticates with the current password, removes personal database data, then deletes the Authentication user. Already shared room results and the current match summary are separate from account history.

## Five-round single-player Games

Single-player offers Game and Practice. Game draws five distinct targets from the existing catalogue, keeps the chosen difficulty/timer/blur for all five rounds, and allows no target skips or searches. A timer expiry without Go is a zero-point DNF. Practice remains open-ended and does not set personal bests.

Completed Games save only the highest total (0–5000) for each difficulty/timer/blur combination under `accountData/{auth.uid}/soloBests/{setting}`. The account must have been verified when the Game started and still be the same account at completion. Records contain score, UTC day, settings, five-round count and the generation key; no coordinates, targets or routes. Scores are client-reported personal records, not cheat-proof competition results. Incomplete Games have no record, and there is no resume after leaving/reloading. Existing per-attempt statistics are still recorded as the player completes valid guesses.

**Required for existing installations:** publish the complete updated `database.rules.json` in Realtime Database → Rules. The new `soloBests` validation is needed even if account rules were published previously. No Authentication provider change, Cloud Functions deployment or billing upgrade is needed. Until rules are updated, gameplay works and a completed Game offers Retry if its record cannot be saved.

The account page lists records and includes them in JSON export. Delete statistics removes both samples and personal bests, opts out of community contributions and rotates the generation key. Games already open before deletion cannot recreate their records.

## Optional server-side community comparison

Cloud Functions deployment requires Firebase's **Blaze** plan (billing account). Do not enable billing just to test personal accounts. No functions or billing have been enabled by this repository change.

Once billing and the server deployment are deliberately chosen:

```sh
npm ci --prefix functions
firebase deploy --only functions:refreshCommunityStatistics,functions:removeDeletedAccountData --project bussole-game
```

The database trigger uses `europe-west1`, on `bussole-game-default-rtdb`. It rebuilds aggregate statistics from the latest private account records, including only explicit version-1 consent. Revocation, statistics deletion and account deletion therefore remove past contributions from the next published pool. Auth deletion also has a cleanup trigger for administrative deletions. The database trigger retries failures. This is eventual consistency: aggregate updates are not immediate.

Only aggregate means and counts are published under `communityStatistics`; clients cannot write there. Both the overall pool and every displayed measure require at least five distinct contributing accounts, separately for All/Easy/Normal/Pro. No per-player contribution cache is retained. The server reads account IDs to process/removes contributions; processing is **pseudonymized, not anonymous**.

**Prototype scaling limit:** each change rebuilds the small pool by reading account statistics. A distributed lease serializes refreshes, handles duplicate/out-of-order events by re-reading the current source, and avoids retaining per-player aggregation state after deletion. Before substantial traffic or large histories, replace full-pool reads with batched/sharded aggregation and bounded events. Protect the deployment with appropriate quotas and monitor costs; the prototype does not claim an unlimited free service or cheat-proof self-reported scores.

## Validation

- `node scripts/test_solo_game.cjs` and `node scripts/test_solo_camera.cjs`: five-round lifecycle, no skips/repeats, totals/DNF and camera reset under live compass updates.
- `scripts/test_solo_ui.cjs`: mobile Game/Practice flow, five distinct targets, verified best, Summary, Practice reset and timed Pro DNF/guest behavior against real Auth/Database emulators. Uses a map/camera facade; it does not validate GPU globe rendering.

- `node scripts/test_account_statistics.cjs`: scalar projection, filters, signed/circular means, undefined geometry, opt-in, deletion and per-measure thresholds.
- Start the Database emulator and run `scripts/test_account_rules.cjs` with `@firebase/rules-unit-testing@5` and `firebase@12.2.1`: owner isolation, verification, field rejection, bounds, generation reset and aggregate privacy.
- `scripts/test_public_room_rules.cjs` confirms existing guest room permissions still work with the combined rules.
- Existing room identity, reconnect, matchmaking, multiplayer scoring, home and sensor-permission tests cover guest gameplay regressions.
- `scripts/test_account_ui.cjs` runs native mobile-browser QA against Auth/Database emulators with Firebase's real JavaScript SDK (test dependencies: esbuild, Playwright, firebase-admin and firebase@12.2.1; use `BUSSOLE_TEST_CHROMIUM` for an existing browser binary). Production email deliverability and password recovery links must also be checked on a phone after enabling the provider.

Official references:

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/database/security/rules-conditions
- https://firebase.google.com/docs/functions/database-events
- https://firebase.google.com/docs/functions/get-started
