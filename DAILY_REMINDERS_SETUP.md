# Free Daily reminders around 17:00

This uses standard browser Web Push and a standard public-repository GitHub Actions runner. It does not deploy Cloud Functions, use Cloud Scheduler, enable Blaze, require a card or use Firebase Admin credentials. It supports multiple devices and IANA device time zones, including daylight-saving changes. No positions, targets, best shots or account email addresses are read by the sender. The sender may read only the current UTC day’s completion score, including zero, for notification suppression; it cannot read full attempts or history. The dedicated sender account has only notification subscriptions, journey snapshots and delivery state access through the database rules.

## One-time owner setup

1. Publish the complete current `database.rules.json` in **bussole-game → Realtime Database → Rules**.
2. On your computer, install Node.js 22+ and run these commands in the repository:

   ```sh
   npm ci --prefix notification-sender --ignore-scripts
   node notification-sender/setup.cjs
   ```

   This creates a private `bussole-reminders-secret.json` and a public `daily-reminder-config.json`. The private file is ignored by git, has owner-only file permissions and is never printed by the helper. Do not send it in chat or commit it.
3. In **Firebase → Authentication → Users → Add user**, create the dedicated account using the email and random password from the private file. It is a service identity, not a player's account, and does not need email verification. Copy its UID into `senderUid` in the public config. Do not use your personal login or any player's credentials. Do not create a service-account key.
4. In **GitHub → mattesta/bussole → Settings → Secrets and variables → Actions → New repository secret**, create **BUSSOLE_REMINDERS_SECRET**. Paste the entire private JSON file as its value. The workflow must use standard `ubuntu-latest` runners in this public repository. It deliberately refuses to run in a private repository or a fork.
5. In **Realtime Database → Data**, create the top-level **dailyReminderConfig** object using the public config, then set its `enabled` value to `true`. Only administrators can change this configuration. It contains a public VAPID key and the sender identity's UID, never the password or private key.
6. Open **GitHub → Actions → Free Daily reminders → Run workflow** once. The job sends only during each device's local 17:00–17:44 window. An unconfigured job sends nothing and exits successfully. A real delivery cannot be tested without opting in on a real device.

## Phone activation

In Bussole **My account → Daily reminder · 17:00**, choose **Enable on this device** and allow notifications. On iPhone/iPad, first add Bussole to the Home Screen and open that installed app. Sign in there if needed. **Test notification** displays a local preview, not a test of the remote scheduler. Enabling creates a fresh account binding; late pushes for another account on the same device are discarded. Signing out disables notifications on that device and unsubscribes the push endpoint. Users can also turn notifications off explicitly.

## Limits and delivery semantics

- Scheduled jobs run every ten minutes and target around 17:00 in the device's saved time zone. Travel/time-zone changes are refreshed when users reopen their account. GitHub can delay or drop jobs; this is not an exact-time alarm or guaranteed daily delivery. It automatically disables scheduled public-repository workflows after 60 days without repository activity. Check/re-enable the workflow after inactivity; no artificial commits are generated.
- The device/network/browser and Focus/Do Not Disturb settings may delay or hide notifications. Expiration is 30 minutes at the push service, and messages over an hour old are discarded locally.
- A per-device/local-date conditional-write ledger and a browser notification tag reduce duplicates. A crash after the push service accepts a message but before the ledger is saved can still cause a retry; exactly-once delivery is not promised.
- Progress uses the latest synchronized Daily journey snapshot, including progressive missed-day penalties since that snapshot. Successful Daily/statistics saves and account refresh sync it across devices; offline or failed synchronization may temporarily leave it behind. Completing today's official Daily suppresses its reminder, including a completed zero score. The sender checks the authoritative current-day completion score before processing devices and immediately before sending. Notifications already accepted or in transit before completion can still arrive; unsynchronized offline completion cannot be known by the server.
- Statistics erasure resets the snapshot to zero while preserving an opted-in reminder. Account deletion removes subscriptions, snapshots and delivery state. The sender discards registrations whose account generation is no longer readable, and removes expired push endpoints and registrations not refreshed for 90 days. This is best-effort cleanup during due runs; turning off this entire feature also stops scheduled cleanup.
- Free means no plan upgrade: ordinary Spark database quotas still apply, and service limits may stop operation. Standard GitHub Actions runners are free for public repositories; larger runners/private repositories have different billing. The workflow intentionally guards against those configurations. No build artifacts or Actions cache are uploaded.
- Web Push subscriptions/keys, time zone, random account binding, update time, journey balance and delivery dates are personal/operational data. They are private to the owner and scoped sender, and readable by project administrators. This feature does not claim administrators cannot access stored data. Reminder content can show the user's progress on the lock screen.

## Stop or remove

Set `dailyReminderConfig/enabled` to false to stop sends and new enrollments, or disable the GitHub workflow. Existing user device subscriptions can be disabled from My account. Remove the repository secret to revoke the sender's credentials, and delete/rotate the dedicated Firebase login if compromised. Keep the VAPID private key private; replacing it requires devices to re-enroll.

Official references: https://docs.github.com/en/billing/concepts/product-billing/github-actions ; https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ; https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ ; https://firebase.google.com/docs/database/rest/auth
