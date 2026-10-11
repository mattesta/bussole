# Public rooms and explorer information

The site supports private invite rooms, public matchmaking, and English explorer biographies with Wikipedia links. Private is the default. Public matchmaking chooses the fullest fresh lobby with a free seat; if none exists, it creates a public room. A public host may start with two players. The first round starts automatically at eight, choosing a random target if needed. Matches that have already begun stay out of matchmaking, including during intermissions. Existing players can resume their seats. Later rounds retain their results/lobby intermission until the host starts again.

## Enable public matchmaking

The website deploy does not update Firebase database rules. In the Firebase console for **bussole-game**, open **Realtime Database → Rules**, replace the full editor contents with [database.rules.json](database.rules.json), and choose **Publish**. The updated rules keep the existing private-game paths compatible and add:

- A signed-in-readable `publicRooms` directory containing lobby counts and timestamps only. Private rooms cannot be published there; the whole `rooms` collection remains unreadable.
- Eight public seat reservations. A connected public player must own the seat matching their explorer/colour. Two simultaneous joins cannot occupy the same seat.
- Lobby-only admission, with pending reservations held for 30 seconds and a 30-second grace period for disconnected players. Stale advertisements expire from matchmaking after 60 seconds; hosts refresh them every 15 seconds.

Before those rules are published, the site explains that public rooms need updated Firebase rules. Private rooms and explorer biographies remain available.

## Public-room location privacy

Republish the current `database.rules.json` to enable location privacy, even if the earlier public-room rules were already deployed. In public rooms, full submissions are readable only by their owner, including after reveal. Hosts cannot read another explorer's location. Other participants read a separate `publicResults` payload containing integer points and, when safe, a short route and error arc. No location, heading, guessed distance or exact error metric is included in that shared payload. Private rooms retain the full-route comparison.

The route extends 300 km each way from the error contact and fades at its ends. Results below 200 points share no geometry. Both the entire short route and the error arc must remain at least 500 km from the player's origin; otherwise only points are shared. A player always sees their own full line and error. These limits reduce location exposure; a visible trajectory and score can still suggest a broad geographic area, so they are not a guarantee of anonymity.

The full submission and reduced result are written atomically. Before the new rules are deployed, public Go submissions fail rather than uploading an unprotected position. Old public-room clients cannot read full submissions after the new rules are deployed; reload the site on every device before testing.

Public matchmaking reads Firebase's virtual `.info/serverTimeOffset` through `onValue`, not `get`, which sends an invalid path to the server.

## Validation

Run the pure and controller tests with `node scripts/test_public_rooms.cjs`, `node scripts/test_public_matchmaking.cjs`, `node scripts/test_public_privacy.cjs`, and `node scripts/test_multiplayer_match.cjs`, alongside the existing test scripts.

To run security tests, install `firebase-tools`, `@firebase/rules-unit-testing`, and `firebase` in a test environment and run:

```
firebase emulators:exec --only database --project demo-bussole "node scripts/test_public_room_rules.cjs"
```

The security suite covers directory permissions, private isolation, concurrent last-seat claims, capacity, disconnect grace, round-phase admission and existing private-player compatibility. It uses a local demo database, not the live project.
