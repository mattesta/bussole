# Optional personal accounts

This prototype keeps guest gameplay and anonymous Firebase authentication. It adds email/password and optional Google accounts, an optional editable display username and a preference to use it for new multiplayer seats. Usernames are optional, editable, unique regardless of case, and searchable by verified users; email remains the login.

## Enable personal accounts

1. In Firebase project `bussole-game`, open **Authentication → Sign-in method → Email/Password**. Enable **Email/Password**, leaving email-link sign-in off. Keep **Anonymous** enabled.
2. Under Authentication settings, make sure **Authorized domains** includes `mattesta.github.io`. Set the password policy minimum to **8 characters**. Enable email enumeration protection if it is not already enabled.
3. Publish the complete updated `database.rules.json` in **Realtime Database → Rules**. Existing room cleanup permissions remain; account samples and communityStatistics uploads are disabled. Never use global public read/write rules.
4. Review Authentication's verification and password-reset email templates. The default Firebase action handler can be used. If the Google API key has HTTP referrer restrictions, allow the game's origin and the Firebase action-handler origin (`https://bussole-game.firebaseapp.com/*`) for authentication to finish. Do not remove API restrictions globally.
5. After the site update is published, open **Sign in → Create account**, verify the email, then press **I have verified**. Try a new single-player guess and open **My account**. Existing guest games are never imported.

Personal statistics are device-only. Global error comparisons are disabled; do not deploy aggregation functions or enable billing. Follow DEVICE_STATISTICS_SETUP.md for the required legacy cleanup and rules rollout.

## Enable Google and social features

1. Publish the **complete updated** `database.rules.json` in Realtime Database → Rules. The rules now allow `password` and `google.com` account sessions, with verified-email checks for statistical writes/social features. They add owner-controlled `publicProfiles`, mutually accepted `connections`, restricted `friendShares` and an opt-in `journeyLeaderboard`. Existing guest room rules are unchanged.
2. Authentication → Sign-in method → **Google** → Enable. Choose the project support email (the owner's email is suitable), then Save. Keep Email/Password and Anonymous enabled. Leave one-account-per-email enabled. Authorized domains must include `mattesta.github.io` and the project's Firebase auth domain. No Blaze upgrade, OAuth token in repository, new paid service or Cloud Functions deployment is needed.
3. Test on a phone in Safari/Chrome: a new Google account, linking Google from an existing signed-in email/password account, logging out/in via Google, then reauthentication and in-app deletion. Popup blocking produces instructions to allow it/open the site directly. The app uses popup auth/link/reauth, not cross-origin redirect storage. Production Google OAuth and iOS/PWA popup behavior require a real-device check after enabling the provider; emulators cannot certify Google's live consent screen.

Existing accounts should sign in first and press **Connect Google**; `linkWithPopup` keeps their UID and statistics. The app does not merge two independently created accounts, import guest history, or persist pending OAuth credentials. An account-exists error tells users to sign in with their existing method and connect Google. Google-only users can add a password via linked Email credentials after Google reauthentication. Their Google email is managed through Google; the separate email/password email controls appear once a password is attached.

## Friends, consent and kilometre leaderboards

Share/copy `account.html?friend={uid}` from My account. A verified player explicitly sends a request, and only the recipient can accept. Both directed connection edges must be atomically consistent on create/accept; both accepted states are required to read the other's shared snapshot. Either participant can remove the friendship; clients delete both edges and close revoked views. Pending requests, strangers and guests cannot read statistics or private account data. A display profile is enabled by explicitly saving a verified username, creating a friend link, sending/accepting a request or opting into the global board (`profile/socialEnabled` is false by default). Registration and ordinary play alone do not publish a profile. Display profiles expose only a chosen username (default Explorer), not Google names/photos or email. Individual profile reads require verified authentication; listing the profile directory is denied.

`friendShares/{uid}` contains only record scores/settings, the Daily journey and Pro points/destination names. Detailed error samples are never shared. Old snapshots containing samples are unreadable by friends under the new rules until migrated or purged. The generation validates against the private profile. Copies already downloaded cannot be recalled.

Global leaderboard participation is optional (`profile/leaderboardOptIn`, default false) and requires a chosen username. `journeyLeaderboard/{uid}` contains name, balance in tenths of km, as-of UTC day and last completed day plus a technical generation key. Readers apply missed-day decay to each snapshot before ranking, including players who are offline. Friends' rankings use their restricted snapshots regardless of global opt-in. Ties share ranks. No public per-player error histories or raw Daily history are used for this board.

**Prototype limits:** sharing reprojects existing private history when the player syncs; background sync is best-effort after saves, with refresh on account/Home and ranking actions. Current snapshots apply the progressive inactivity schedule. Legacy balances made before this release are rebuilt from full history at the owner’s next sync; historical excess penalties cannot be reconstructed from a legacy public snapshot alone. Public snapshot age is respected for inactivity penalties but a failed publish can delay newly earned credit until that player syncs again. Scores/balances are client-reported, not cheat-proof. Rebuilding snapshots reads/writes history linearly and global ranking downloads the small opted-in board; revisit batching/aggregation/pagination before large histories/traffic. This is intended for the existing small user group, within Spark quotas, not an unlimited free scale guarantee.

Turning global participation off deletes its entry atomically with the preference change. Delete statistics clears shared records and the global entry, opts out of global ranking and rotates generation; current empty snapshots may be rebuilt, without past data. Account deletion reauthenticates, removes private records, daily public contributions, social profile/snapshots/leaderboard and known request/friend edges before deleting Auth. In-app deletion handles cleanup without server functions; administrative Auth-only deletions still require explicit database cleanup. The optional legacy server trigger only removes the private account branch; it does not clean social edges, social snapshots or published Daily scores. Use in-app deletion for the full cleanup.

## Data model and privacy

`accountData/{uid}/profile` allows username, useInRooms, leaderboardOptIn, socialEnabled and generation. `samples` rejects every non-null write. Detailed per-guess errors are stored in IndexedDB only, scoped by account and reset generation. No fallback uploads occur if storage fails. Personal charts do not sync between devices; export preserves a local copy. Local records are hidden on sign-out and retained for the same account's next login.

Cloud Pro records contain only sampleId, points, destination and generation. Personal bests and official Daily records remain score-based cloud records. Administrators can access those records. Scores and destinations are not a guarantee against every possible inference.

Legacy current-generation samples are copied to local storage before the cloud source is deleted. A storage error leaves the cloud source pending and displays a warning. Other accounts must migrate or be purged by the owner. See DEVICE_STATISTICS_SETUP.md.

Statistics deletion clears this device's errors/replays and resets cloud records/generation. Other devices hide their previous-generation records on their next refresh, but cannot be physically erased remotely. Account deletion reauthenticates and deletes database data before deleting the Authentication user.

## Five-round single-player Games

Single-player offers Game and Practice. Game draws five distinct targets from the existing catalogue, keeps the chosen difficulty/timer/blur for all five rounds, and allows no target skips or searches. A timer expiry without Go is a zero-point DNF. Practice remains open-ended and does not set personal bests.

Completed Games save only the highest total (0–5000) for each difficulty/timer/blur combination under `accountData/{auth.uid}/soloBests/{setting}`. The account must have been verified when the Game started and still be the same account at completion. Records contain score, UTC day, settings, five-round count and the generation key; no coordinates, targets or routes. Scores are client-reported personal records, not cheat-proof competition results. Incomplete Games have no record, and there is no resume after leaving/reloading. Existing per-attempt statistics are still recorded as the player completes valid guesses.

**Required for existing installations:** publish the complete updated `database.rules.json` in Realtime Database → Rules. The new `soloBests` validation is needed even if account rules were published previously. No Authentication provider change, Cloud Functions deployment or billing upgrade is needed. Until rules are updated, gameplay works and a completed Game offers Retry if its record cannot be saved.

The account page lists records and includes them in JSON export. Delete statistics removes both samples and personal bests, clears shared records and rotates the generation key. Games already open before deletion cannot recreate their records.

## Daily Challenge (Spark-compatible)

Daily Challenge v1 uses Normal and 30 seconds. Blur is on through 2026-10-21 UTC and off from 2026-10-22 00:00 UTC, selected by the challenge’s pinned day, with five deterministic targets per UTC day (00:00 reset). `daily-targets-v1.json` is an immutable snapshot of the existing catalogue; do not edit it or the v1 PRNG in place, including during a day. Catalogue changes need a versioned release. Difficulty/timer/blur changes are code settings and should activate at a future UTC day boundary; they do not require new database rules. A changed score cap or stored schema may require rule updates. Practice and ordinary Games still use `targets.js`.

Verified accounts reserve an official attempt on Start, using a transaction at `accountData/{uid}/dailyAttempts/{UTCday}`. The server enforces today's UTC day, timestamp, generation, allowed fields and immutable completion score. Repeat starts, reloads and guests play unranked, without replacing the original attempt. Abandoned attempts do not enter the comparison. Deleting statistics intentionally removes participation, as do account deletion; recreating accounts or deliberate erasure is not prevented as an anti-abuse guarantee.

After five rounds, completion stores a scalar score and publishes it under a random per-day key at `dailyScores/{UTCday}/{entryKey}`. The public branch contains only scores; no names, account IDs, locations, targets or routes. Private generation/key mapping authorizes publish/deletion. A retry can publish an already completed attempt but cannot change its score. Day is pinned at start so games crossing midnight finish against their original day. The client reads only that day's scores, excludes its own entry and counts strictly lower scores; competition rank (#2 of 3, with tied rank when needed) includes the current player and all completed participants; the percentage remains secondary. Equal scores share a rank and subsequent positions skip accordingly (1, 2, 2, 4). First finishers see a waiting message. This is exact for the downloaded current snapshot, not a privacy-preserving aggregation of secret values or a cheat-proof score service. No Cloud Functions, billing or new provider needed. Downloads grow with daily participation; public scores remain until the owner deletes them, with no promised automatic retention cleanup.

Publish the full updated `database.rules.json` before official attempts can work. Guests can play unranked without these new writes. The account export includes day/status/score; deletion removes private attempts and public scores atomically together with the usual statistics/generation reset. User-facing participation and sharing details appear before the official Start and on `account-privacy.html`.

## Private Daily journey

Daily kilometres are derived from existing private, completed official `dailyAttempts` in the current profile generation. No new database fields, rules, Authentication provider, Cloud Functions or billing are needed. Ordinary Game, Practice, unranked replays and abandoned attempts do not earn kilometres. Historical completed official Dailies count automatically. A completed zero-point Daily counts as played, earns zero, and avoids a missed-day penalty.

Each point earns 0.1 virtual km (1000 points = 100 km, maximum 500 km per Daily). Use integer score units internally to avoid rounding drift. Process completed days in UTC order: subtract 100 km on the first consecutive missed day, 200 on the second, and 300 on the third and each later missed day, clamp at zero, then credit the next completed day. Completing a Daily (including zero points) resets the missed-day streak. Only fully ended days are missed; today remains open until 00:00 UTC. Penalties begin after the first completed official Daily, with no penalty for earlier inactivity. Days elapsed while the app is closed are applied when the account is read, without scheduled writes. Cross-midnight results belong to their pinned challenge day, as before.

The Home Daily panel, official results and account page show the current balance and its percentage of approximately 40,075 km (equatorial circumference). The percentage can exceed 100%; it describes a virtual journey, not tracked physical movement. Guests and unranked plays earn nothing. Balance is calculated using the database clock and owner-only history. Optional social snapshots power the separate leaderboards described above. Account export includes a derived snapshot alongside the underlying daily records. Deleting statistics/account removes those records and resets the journey, including its starting day.

## Global error comparisons disabled

There is no active community-statistics reader, consent control or aggregation trigger in this version. Rules deny communityStatistics access. Do not deploy an aggregation function. If an earlier refreshCommunityStatistics function was actually deployed, remove it separately in the Firebase console; removing repository code does not delete a deployed function. The optional Daily kilometre leaderboard remains independent.

## Validation

- `node scripts/test_daily_progress.cjs`: chronological rewards/penalties, floor at zero, UTC/today handling, generation/future filters, completed zero vs abandoned days, multiple Earth laps and 200 histories checked against a reference wallet.

- `scripts/test_daily_batch_ui.cjs`: mobile UI with service/map facades, settings and launch URL on both sides of the 2026-10-22 UTC blur transition, actual blur overlay and rank wording/layout.
- `node scripts/test_daily_challenge.cjs`: pinned deterministic catalogue, UTC changeover, fixed settings and percentile/self/tie behavior.
- `scripts/test_daily_rules.cjs`: real Database rules, cross-device reservation, verified ownership, immutable scalar scores, cross-midnight completion, deletion and stale-generation barriers.
- `scripts/test_daily_ui.cjs`: native mobile browser with real SDK/Auth/Database emulators; official completion, live percentile, partial-publication recovery, replay/guest exclusion, reload, Summary, export and private/shared erasure. Uses the same map/camera facade as solo-flow QA, not WebGL tiles.

- `node scripts/test_solo_game.cjs` and `node scripts/test_solo_camera.cjs`: five-round lifecycle, no skips/repeats, totals/DNF and camera reset under live compass updates.
- `scripts/test_solo_ui.cjs`: mobile Game/Practice flow, five distinct targets, verified best, Summary, Practice reset and timed Pro DNF/guest behavior against real Auth/Database emulators. Uses a map/camera facade; it does not validate GPU globe rendering.

- `node scripts/test_account_statistics.cjs`: local sample projection, filters, signed/circular means and undefined geometry.
- Start the Database emulator and run `scripts/test_account_rules.cjs` with `@firebase/rules-unit-testing@5` and `firebase@12.2.1`: owner isolation, verification, field rejection, bounds, generation reset and cloud error rejection.
- `scripts/test_public_room_rules.cjs` confirms existing guest room permissions still work with the combined rules.
- Existing room identity, reconnect, matchmaking, multiplayer scoring, home and sensor-permission tests cover guest gameplay regressions.
- `scripts/test_account_ui.cjs` runs native mobile-browser QA against Auth/Database emulators with Firebase's real JavaScript SDK (test dependencies: esbuild, Playwright, firebase-admin and firebase@12.2.1; use `BUSSOLE_TEST_CHROMIUM` for an existing browser binary). Production email deliverability and password recovery links must also be checked on a phone after enabling the provider.

- `scripts/test_social_rules.cjs`: verified Google ownership, mutual friendship acceptance, pending/stranger denial, revocation, projection field restrictions, opt-in/out and stale generation.
- `node scripts/test_social_model.cjs`: private projection, ranking ties and automatic offline decay.
- `scripts/test_social_ui.cjs`: real SDK/emulator mobile request/accept/revoke flow, friend records and rankings, global opt-in, Google popup linking/sign-in with stable UID and Google-only accounts.

Official references:

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/database/security/rules-conditions
- https://firebase.google.com/docs/functions/database-events
- https://firebase.google.com/docs/functions/get-started

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/account-linking

## Username reservation and account details

Publish the complete current database.rules.json before using username saves/search. `usernames/{lowercase-name}` maps to a UID. Verified users may read a specific name, but not enumerate the root. Profile edits atomically claim the new key and release the previous owned key; rules reject conflicting/case-only duplicate claims and require the key to match the final profile. The username can be changed, and account deletion releases it; statistics deletion keeps it. Saving a verified username makes the minimal display profile searchable for friend requests, without granting statistical access. Pending/stranger privacy and acceptance rules remain unchanged. Existing display names are preserved without silent migration: their owner must save preferences to reserve them; the first successful claim wins if legacy names collide. Guest explorer names remain independent. Name-based requests resolve the UID once; existing friendships survive later renames. Old friend links remain supported.

My account lists the top three cloud Pro score records, ordered by points with an opaque identifier tie-break; no error values are uploaded for tie-breaking. It shows points and destination, with private globe replay only if that shot exists on this device. The Daily average includes completed official scores, including zero scores and excluding missed/abandoned/replay days. No additional cloud average is stored.

Statistical charts support two-finger pinch and pan, zoom buttons and reset. Distance ticks update in original percent units. The angular overview remains a full circle; zoom opens a bounded upper angular window with original degree labels, deliberately magnifying separation without claiming that displayed fan angles equal unscaled physical bearings. One-finger hold inspection still selects only near an actual visible stroke; labels and mean use the same data after zoom.

Validation: test_usernames_rules.cjs covers atomic case-insensitive races, ownership, rename/release and legacy migration; test_social_ui.cjs covers case-insensitive username requests/conflicts and deletion cleanup with the real SDK; test_chart_zoom.cjs sends native two-finger gestures and checks ticks, panning, transformed inspection and reset. Daily progress/social model tests compare wallets and snapshot decay against full history across streaks.


## Private Pro shot replay
Publish the complete rules and follow `PRIVACY_CLEANUP_SETUP.md` before deploying this version. The three best replayable Pro shots keep starting coordinates, heading, chosen distance and target coordinates only in the owner's browser, scoped by UID and statistics generation. `accountData/{uid}/proShots` now holds scalar metadata and destination names only. Friends receive points and destination names. Replay geometry does not sync between devices; clearing browser data removes it. Account exports include locally available replays, and statistics/account deletion clears them on the current device. Historical cloud geometry is migrated locally on account load or erased through the owner-run purge. The globe receives geometry through a same-origin iframe message, never through URLs. Public rooms submit points only. Private rooms also relay encrypted temporary line messages, with device-only secret keys; see PRIVATE_ROOM_LINES.md. Personal guesses load from tab storage. Rooms are deleted on an explicit last-player exit, expire after at most 24 hours, and have a separately configured free cleanup workflow for abandoned sessions. Rules block legacy uploads but do not erase old records automatically. Administrators still have access to server-side profile information, scores and destination names; detailed per-guess errors are device-only in this version.


## Daily push reminders
See DAILY_REMINDERS_SETUP.md for the free GitHub Actions + standard Web Push sender, scoped Firebase password identity, setup, iPhone installation, opt-in, retention and delivery limits. No billing plan, Cloud Function or location access is added. Public configuration defaults to unavailable until owner setup.
