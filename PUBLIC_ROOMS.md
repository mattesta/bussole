# Public rooms and explorer information

The site supports private invite rooms, public matchmaking, and English explorer biographies with Wikipedia links. Private is the default. Public matchmaking chooses the fullest fresh lobby with a free seat; if none exists, it creates a public room. A public host may start with two players. The first round starts automatically at eight, choosing a random target if needed. Matches that have already begun stay out of matchmaking, including during intermissions. Existing players can resume their seats. Later rounds retain their results/lobby intermission until the host starts again.

## Enable public matchmaking

The website deploy does not update Firebase database rules. In the Firebase console for **bussole-game**, open **Realtime Database → Rules**, replace the full editor contents with [database.rules.json](database.rules.json), and choose **Publish**. The updated rules keep the existing private-game paths compatible and add:

- A signed-in-readable `publicRooms` directory containing lobby counts and timestamps only. Private rooms cannot be published there; the whole `rooms` collection remains unreadable.
- Eight public seat reservations. A connected public player must own the seat matching their explorer/colour. Two simultaneous joins cannot occupy the same seat.
- Lobby-only admission, with pending reservations held for 30 seconds and a 30-second grace period for disconnected players. Stale advertisements expire from matchmaking after 60 seconds; hosts refresh them every 15 seconds.

Before those rules are published, the site explains that public rooms need updated Firebase rules. Private rooms and explorer biographies remain available.

## Validation

Run the pure and controller tests with `node scripts/test_public_rooms.cjs` and `node scripts/test_multiplayer_match.cjs`, alongside the existing test scripts.

To run security tests, install `firebase-tools`, `@firebase/rules-unit-testing`, and `firebase` in a test environment and run:

```
firebase emulators:exec --only database --project demo-bussole "node scripts/test_public_room_rules.cjs"
```

The security suite covers directory permissions, private isolation, concurrent last-seat claims, capacity, disconnect grace, round-phase admission and existing private-player compatibility. It uses a local demo database, not the live project.
