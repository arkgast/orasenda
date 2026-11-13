# Orasenda: Decision Log

Architecture and product decisions, one entry each, newest last. Use the template below.

## Template
### ADR-NNN: Title
- **Date:**
- **Status:** proposed | accepted | superseded by ADR-XXX
- **Context:** what forces the decision
- **Options considered:**
- **Decision:**
- **Consequences:** trade-offs and follow-ups

## Pending
- The anti-quit helper (strong lock, P7) is left open in ADR-004 and gets its own spike before P7.

## ADR-001: Tech stack and code sharing
- **Date:** 2026-11-07
- **Status:** accepted (the P0 spike confirmed Tauri hosts the overlay as a non-activating panel; see ADR-004)
- **Context:** SPEC §7 asks for the stack that best shares code across desktop, web and mobile. The hardest features are native: foreground-app detection, overlays, an anti-quit helper, idle detection. Timers, blocking and tracking must keep running while the window is hidden, but WebKit throttles timers in hidden pages and macOS App Nap throttles hidden apps. Targets: macOS first, Windows next, iOS and Android later, a web app in P10.
- **Options considered:**
  1. **Tauri 2 + React + a Rust core:** native APIs reachable from Rust on every OS; the same Rust runs on iOS and Android through Tauri mobile; small, fast app. Each OS renders with its own webview (WebKit, WebView2), and Tauri mobile is younger than desktop.
  2. **Electron + TypeScript:** mature, one Chromium everywhere; heavy for a menu-bar app, native work needs Node addons, no mobile.
  3. **Native SwiftUI, Kotlin/WinUI later:** best macOS fit; no code sharing across platforms.
  4. **Flutter:** one UI everywhere; native work through platform channels in several languages, Dart for logic, weaker desktop accessibility.
  5. **React Native / Expo with react-native-macos and -windows:** strong mobile; desktop ports lag, native modules per OS.
  For where the logic lives: (A) a Rust core and React only renders; (B) TypeScript logic with thin Rust adapters; (C) split by feature.
- **Decision:** Tauri 2 (2.12.x) with React 19 and TypeScript, option A. Product logic lives in `crates/core`: plain Rust, no Tauri, no OS-specific code, time passed in as input. The Tauri app crate wires core to commands and events; React renders state and sends intents. Platform tiers: **macOS 13+ gating** (required CI), **Windows 11 advisory** (CI runs, never blocks), **iOS and Android scaffolded and smoke-tested by hand** (no mobile features until P10). Rust is pinned in `rust-toolchain.toml` (1.99.1) and bumped by PR.
- **Consequences:**
  - OS integrations (App Nap activity assertion, foreground-app detection, overlays) go in the app crate or a future platform crate behind an interface, never in core. The spike decides that layout.
  - Every core dependency must build for `aarch64-apple-ios` and `aarch64-linux-android`; `scripts/ci.sh` checks it.
  - The P10 web app needs core compiled to WebAssembly or served; keeping `SystemTime::now()` out of core preserves that option.
  - Both WebKit and WebView2 must be exercised; until a Windows machine is set up, Windows is covered only by CI.
  - Tauri 3 is in alpha (3.0.0-alpha.6); migrate once it is stable and tauri-specta supports it.
  - Spec: [docs/specs/2026-11-07-app-shell.md](specs/2026-11-07-app-shell.md).

## ADR-007: Typed IPC contract with tauri-specta 2
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** Rust commands and events need matching TypeScript types; hand-kept types drift silently. The only maintained generator covering commands *and* events for Tauri 2 is tauri-specta 2, which has only release candidates (2.0.0-rc.26, 2026-10-21) and requires exact pins of its siblings.
- **Options considered:**
  1. **tauri-specta 2 RC, exact-pinned:** typed commands and events, generated `bindings.ts`; pre-release.
  2. **ts-rs 12:** stable, but types only: commands and events stay hand-written.
  3. **Hand-written types plus a contract test:** no dependency; the test is the generator we would be writing.
- **Decision:** Option 1. Pin `tauri-specta =2.0.0-rc.26`, `specta =2.0.0-rc.26`, `specta-typescript =0.0.13` in `[workspace.dependencies]`. `bindings.ts` is generated, committed and checked for staleness in `scripts/ci.sh`. 64-bit integers are exported as `number` explicitly with `#[specta(type = specta_typescript::Number)]` where values stay below 2^53.
- **Consequences:** upgrades move the three pins together. Exit plan: if tauri-specta 2 has no release for 6 months or blocks a Tauri upgrade, switch to option 3, keeping the committed `bindings.ts` as the starting point.

## ADR-002: Local storage, ready for sync
- **Date:** 2026-11-07
- **Status:** accepted (the sync parts are a direction, decided in detail in P10)
- **Context:** Orasenda is local-first. Sync is a paid feature later (ADR-006): end-to-end encrypted, single user, several devices, low concurrency, mostly structured rows. Retrofitting sync onto a store that wasn't built for it is expensive; building the whole sync stack now is over-engineering.
- **Options considered:**
  1. **SQLite with a field-level change log, sync built later** (op-log, hybrid logical clock, last-writer-wins per field, server as an encrypted mailbox that only orders messages).
  2. **A CRDT library for everything** (Automerge 3, Loro 1.0): mergeable by design, but document-shaped; doubles the storage model for a relational app.
  3. **cr-sqlite or the SQLite session extension:** CRDT or changesets inside SQLite; a loadable extension that is awkward on iOS and WebAssembly, and not designed for an encryption-blind server.
  4. **PowerSync or ElectricSQL:** the server reads plaintext, which rules out end-to-end encryption.
- **Decision:** Option 1, in two steps.
  - **From P1:** SQLite through `rusqlite` (bundled) in a new `crates/store`, so `crates/core` stays free of a database and can compile to WebAssembly. WAL mode; versioned migrations via `PRAGMA user_version`. Every entity has a UUIDv7 `id`, `created_at`, `updated_at` and a `deleted_at` tombstone. A `meta` table holds `schema_version`, a random `device_id` and the clock state. Every write appends **one row per changed field** to `change_log(seq, hlc, device_id, entity, entity_id, field, value, synced_at)` in the same transaction. Each repository declares whether its entity is syncable or device-only; `BypassEvent` reasons and raw `UsageRecord`s are device-only. Kanban and checklist order use fractional-index strings; `HabitCheck` is keyed by habit and date; sessions and usage records are append-only. Export and import use a versioned JSON bundle (CSV for usage). *(Amended 2026-11-12 by ADR-018: export, import and backups use whole SQLite copies of the database.)*
  - **In P10:** a `SyncEngine`, an encryption layer and a `SyncTransport` interface with an HTTP implementation (JSON or CBOR, cursor polling, optional WebSocket or SSE push). Free-text fields may move to Loro if last-writer-wins proves too coarse. The first sync seeds the log from the current state, so the P1 log only has to be correct from the moment sync is switched on.
  - **Keys (P10 direction, reviewed by a cryptographer before shipping):** a random account root key, wrapped by a key derived from a sync passphrase with Argon2id; data keys via HKDF; XChaCha20-Poly1305 envelopes. The passphrase never leaves the device; a printable recovery key wraps the same root key. Account login is separate from encryption.
- **Consequences:** every repository write goes through the change log from day one; a pruning job removes synced entries later. Encryption at rest relies on FileVault until an optional SQLCipher mode. gRPC is not used: browsers would need a gRPC-Web proxy and it brings nothing at this scale. The protocol crate (`crates/sync-protocol`) will be Apache-2.0 so the private server can use it (ADR-009).

## ADR-003: Distribution
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** Tracking and blocking (P5–P7) need system access that the Mac App Store sandbox likely forbids (Accessibility, hiding other apps, an anti-quit helper). Users need updates without a store.
- **Options considered:**
  1. **Notarized direct download first, stores later:** full feature set; requires the Apple Developer Program ($99 a year).
  2. **Mac App Store first:** discovery and payments built in; sandbox limits blocking; in-app purchase rules for sync.
  3. **Both from the start:** two builds and two support paths for a solo developer.
- **Decision:** Option 1. macOS: Developer ID signing, notarization, a DMG on GitHub Releases, the Tauri updater with signed update manifests (the update check is disclosed and can be turned off), and a Homebrew cask. Windows (advisory): a signed installer; the signing route is open, since Azure Trusted Signing did not accept individual developers when checked, so an OV certificate or the Microsoft Store (MSIX) are the candidates. Stores (Mac App Store, Microsoft Store, later iOS and Android) come after v1 and only if they are worth a reduced build.
- **Consequences:** a release workflow (signing, notarization, update manifest) is needed before the private beta; signing secrets live in a protected CI environment. Direct sales use a merchant of record (Paddle or Lemon Squeezy) for tax; store builds would sell sync through in-app purchase.

## ADR-006: Business model
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** The product promises calm, autonomy and privacy, which rules out ads, selling data, nagging upsells and paywalled privacy. Sync is the first feature with a running cost.
- **Options considered:** donations only; a free app with paid sync; a one-time purchase; open source with paid hosted sync; an early-supporter licence. Comparable prices (checked 2026-11-07): Obsidian Sync about $4–8 a month, Standard Notes $90–120 a year, Session Pro $39.99 a year, Structured Pro $19.99 a year, Things $49.99 one-time.
- **Decision:** **Local features never require an account or a subscription.** Revenue: **Orasenda Sync**, a subscription run by Veloud (end-to-end encrypted sync, later the web app and online features), aimed at about $4–5 a month billed annually; a one-time **supporter licence** (about $25–39: early betas, credits, cosmetic icons and themes, no features locked); **donations** (GitHub Sponsors, Buy Me a Coffee) from the first public release. Family and team plans only once sharing features exist. Sync is never sold as a lifetime plan.
- **Consequences:** monetisation appears only in Settings → Sync and on the website: no banners, trial countdowns or "pro" badges in the app. Revenue before v3 comes from supporters and donations. Prices are set before v3 with real usage data.

## ADR-008: No telemetry
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** Orasenda records sensitive behaviour (app usage, distractions, routines). Trust is the product's main differentiator, and the code is public, so any data collection is visible.
- **Options considered:** analytics and crash reporting on by default; opt-in only; none.
- **Decision:** **No telemetry and no analytics in the app.** Crashes are written to a local log that the user can attach to a bug report by hand. An opt-in crash upload may be added later, off by default and documented. The only network calls are the update check (ADR-003, can be turned off) and, when the user enables it, sync.
- **Consequences:** product decisions rely on beta feedback, reviews and opt-in surveys. The privacy policy can say plainly that nothing leaves the device unless the user turns on sync or updates. A CI check may later forbid analytics SDKs in dependencies.

## ADR-009: Licence and trademark
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** The repo is public. Others should be able to improve and fork the app; paid sync should stay with the project; contributors' work should stay open; App Store builds must stay possible.
- **Options considered:**
  1. **AGPL-3.0 + CLA:** strong copyleft; the CLA gives the owner relicensing rights, which some contributors dislike; App Store builds need an extra permission that every contributor must grant; its network clause adds little for a desktop app.
  2. **MPL-2.0 + DCO:** file-level copyleft, explicit patent grant, App Store compatible, contributors keep their copyright.
  3. **FSL-1.1:** forbids competing use for two years; not open source.
- **Decision:** Option 2. `LICENSE` is MPL-2.0; contributions are signed off under the DCO 1.1; `TRADEMARKS.md` reserves the name and logo, so forks rename. The sync server stays closed source in a private repo, and `crates/sync-protocol` will be Apache-2.0. Copyright is held by Arnold Gandarillas Castillo until Veloud is a registered company.
- **Consequences:** no licence can stop a rebranded fork from building its own sync; the trademark, the official server and trust are what protect paid sync. A lawyer should review the licence files and a trademark search for "Orasenda" should run before the public launch. Third-party notices are generated for bundled dependencies and fonts.

## ADR-010: Platform code layout
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** ADR-001 keeps `crates/core` free of Tauri and OS code and left the layout of OS integrations (foreground-app detection, overlays, hiding apps, idle time) to the P0 spike. Windows follows macOS, and core logic such as "should this app be intercepted?" must be testable without an OS.
- **Options considered:**
  1. **Traits in core, one `crates/platform-<os>` per OS, wired by the app crate:** core holds pure types and traits (`ForegroundSource`, `AppControl`, `IdleSource`); `crates/platform-macos` implements them with `objc2`; the app crate picks the implementation with `cfg(target_os)` and target-specific dependencies.
  2. **Modules inside the app crate** (`src-tauri/src/platform/<os>`): fewer crates, but OS code is tied to Tauri and hard to test or reuse.
  3. **A Tauri plugin per capability:** plugin permissions and boilerplate; still tied to Tauri.
- **Decision:** Option 1. Core defines the traits and never depends on `objc2`, `windows` or any OS crate and never uses `cfg(target_os)`. Each platform crate compiles to an empty crate on other targets (`#![cfg(target_os = "...")]`). The app crate is the only place that chooses an implementation. macOS bindings use the `objc2` family at the versions Tauri already depends on.
- **Consequences:** product logic can be unit-tested with fake sources. Adding Windows means a `crates/platform-windows` against the same traits. Traits may grow as P5–P7 need more; changing them is a core change and goes through review. Spec: [docs/specs/2026-11-07-macos-blocking-spike.md](specs/2026-11-07-macos-blocking-spike.md).

## ADR-004: macOS app-blocking approach
- **Date:** 2026-11-07 (accepted 2026-11-08)
- **Status:** accepted
- **Context:** SPEC §2.7 blocks distracting apps with a calm overlay, hiding or optionally closing them, without MDM and, ideally, without system permissions. The app is distributed outside the Mac App Store (ADR-003), so the sandbox does not apply.
- **Options considered:**
  1. **Detect with `NSWorkspace` activation notifications; overlay with a Tauri window raised above full-screen apps; hide or terminate with `NSRunningApplication`:** no permission expected; reuses the design system's `IntentPrompt`.
  2. **Same detection, native `NSPanel` overlay:** most likely to float above everything; rebuilds the UI in AppKit.
  3. **Accessibility API (`AXUIElement`) to watch and act on windows:** finer control (per window), but needs the Accessibility permission and reads more than needed.
  4. **Screen Time / Family Controls:** not available to macOS apps outside the Family Controls entitlement and MDM-style setup.
- **Decision:** option 1, with option 2's non-activating panel applied to Tauri's window.
  - Detect with `NSWorkspace` activation notifications.
  - Show the overlay as a Tauri webview window turned into a non-activating `NSPanel` (`OverlayStrategy::NonActivatingPanel`). The UI stays `IntentPrompt`; nothing is rebuilt in AppKit. A window level and collection behavior alone (`LevelAndCollection`) do not show above full-screen apps.
  - Hide or terminate with `NSRunningApplication`. Close mode stays: apps quit normally, and an app with unsaved changes shows its own dialog.
  - Evidence: the spike's findings ([docs/spikes/2026-11-07-macos-blocking.md](spikes/2026-11-07-macos-blocking.md)), from a reduced matrix the owner chose to close P0. Detection worked for every switch method tried, the panel showed above full-screen apps in 2–40 ms, and no permission was needed.
- **Consequences:**
  - The anti-quit helper for the strong lock is **not** decided here; it gets its own spike before P7.
  - Notarized, Developer ID-signed behavior must be re-checked before the private beta (the spike used ad-hoc signing). That re-check and the deferred matrix rows are #61.
  - On macOS 27, `hide` returns NO even when it works; Orasenda must not trust it (see `docs/common-issues.md`).
  - Back to focus still leaves you on a full-screen target's Space after a trackpad swipe (#59).
  - The panel is a class swap under tao; re-verify on every tao/objc2 upgrade (see `crates/platform-macos/src/overlay.rs`).
  - Keyboard, Escape and VoiceOver on the panel are unverified (#61).

## ADR-005: macOS usage-tracking approach and permissions
- **Date:** 2026-11-07 (accepted 2026-11-08)
- **Status:** accepted
- **Context:** SPEC §2.6 records the foreground app and its duration, pauses on idle, and never records titles, keystrokes or content. Permissions are requested only when needed, and ideally none are needed.
- **Options considered:**
  1. **Foreground changes from `NSWorkspace` notifications, idle from `CGEventSourceSecondsSinceLastEventType`:** event-driven, no permission expected, only app identity and time.
  2. **Polling `frontmostApplication`:** simple, but wakes the CPU and adds latency.
  3. **`CGWindowList` or the Accessibility API:** window-level data, needs Screen Recording or Accessibility, and collects more than the privacy promise allows.
- **Decision:** option 1, with segments built in `crates/core` and time passed in. The spike's findings ([docs/spikes/2026-11-07-macos-blocking.md](spikes/2026-11-07-macos-blocking.md)) confirm it: no permission or prompt, CPU 0.22 % on average over 5 minutes with the flag on, and idle closes the open segment at idle start while the next input opens a new one.
- **Consequences:** domains come only from the browser extension (P7). Private-window exclusion depends on the extension. Storage, retention and export follow ADR-002 in P5.


## ADR-011: Time and scheduling
- **Date:** 2026-11-08
- **Status:** accepted (2026-11-09, #110)
- **Context:** P1 adds the first timed product behaviour (focus sessions; later breaks, the two-minute cue, routines and blocks). ADR-001 keeps `SystemTime::now()` out of core and puts time in Rust because WebKit throttles hidden pages and App Nap throttles hidden apps. A countdown must stay true while the window is hidden, across sleep and across a relaunch, and every surface (Today, menu bar, later the mini timer and full screen) must show the same digits. WKWebView also ignores the macOS 24-hour setting (`docs/spikes/2026-11-07-macos-blocking.md`).
- **Options considered:**
  1. **Pure engines in core fed with `now_ms`, one scheduler thread in the app crate, the wall clock as the only time base, Rust formats every time string:** no drift from missed ticks, survives relaunch, one formatter for every surface; a backward clock change makes the remaining time grow.
  2. **A monotonic clock (`Instant`) for the countdown:** immune to clock changes, but it stops during sleep on macOS and cannot be persisted across a relaunch.
  3. **Countdown accumulated from ticks, or JavaScript timers in the webview:** simplest to write; drifts whenever a tick is late, and the webview sleeps when hidden.
- **Decision:** Option 1.
  - Core engines (`timer::Session` first) take `now_ms` and return milestones; they never read the clock and never accumulate ticks. Remaining time is derived from the start time, the planned length and the pauses; a session ends at its planned end even when the engine is advanced late (after sleep or a relaunch).
  - The app crate owns one `session-scheduler` thread (the shell's clock ticker, extended) that wakes on whole wall-clock seconds, advances the engines, and publishes the result: the wall clock every second, timer events only while something runs, the menu-bar title, notifications. Commands run the same advance-then-publish step synchronously.
  - Local-time facts (UTC offset at a given instant, hour cycle) come from a `LocalTime` trait in core implemented per platform crate, with a UTC default; no `time` or `chrono` dependency.
  - The wall clock (`SystemTime`, UTC epoch ms) is the only time base. Sleep counts as elapsed. A forward clock change ends sessions that are due; a backward one is clamped (elapsed never negative) and otherwise accepted.
  - Rust produces every time string: countdowns, spoken labels, the menu-bar title, finish times and wall clocks. The hour cycle is read by the platform crate and passed in. The webview never computes time.
  - A `KeepAwake` trait in core, implemented in `crates/platform-macos` with an `NSProcessInfo` activity that allows idle sleep, is held while a session runs so App Nap does not delay the end.
- **Consequences:** every later timed feature is a milestone from a core engine, never a `setTimeout`. Time formatting is English and lives in Rust until i18n arrives, which then also lives in Rust. Re-basing on clock changes is a possible later addition. Spec: [docs/specs/2026-11-08-focus-session-loop.md](specs/2026-11-08-focus-session-loop.md).

## ADR-012: Store crate API
- **Date:** 2026-11-08
- **Status:** accepted (2026-11-09, #110)
- **Context:** ADR-002 fixes the storage shape (SQLite in `crates/store`, UUIDv7 ids, tombstones, one `change_log` row per changed field, syncable versus device-only entities, versioned migrations) but not how code uses it. Every P1 sub-project adds tables, so the API pattern must be settled with the first one.
- **Options considered:**
  1. **One `Store` with a mutex-guarded connection, closure-scoped transactions, repository modules, and a typed `log_fields` that appends the change-log rows for a row the repository just wrote, in the same transaction; device-only repositories skip the log by type:** small, testable with an in-memory database, hard to bypass the log by accident.
  2. **An ORM or query builder (diesel, sea-orm, sqlx):** more code and compile time, async or macro machinery the app does not need, and the change log would still be hand-written.
  3. **Repositories that write SQL freely and remember to log:** the log becomes a convention and drifts.
- **Decision:** Option 1.
  - `Store::open(path, new_device_id)` and `Store::open_in_memory(new_device_id)` (the app crate makes the UUIDv4; the store writes it to `meta` only when absent, because the store never makes ids or reads the clock); one `rusqlite` connection behind a `Mutex`; WAL mode; `store.read(|txn| …)` and `store.write(now_ms, |txn| …)` closures, one SQLite transaction each; `now_ms` feeds the hybrid logical clock and `txn.now_ms()` gives repositories their `updated_at`.
  - Repositories are modules with functions over `&mut Txn` (`settings::set`, `focus_sessions::insert`, …). A syncable repository writes its own row (so it owns `created_at`, `updated_at` and its column types) and then calls `txn.log_fields(entity, id, &[(field, value)])`, which appends one `change_log` row per field stamped with a hybrid logical clock from core (`clock::Hlc`, stamp `{wall_ms:013}-{counter:05}-{device_id}`) and the device id, in the same transaction. A device-only repository writes rows directly and is marked device-only in its module doc; it never touches `change_log`.
  - Live or ephemeral state (the active session, later window positions, bypass reasons, raw usage) is device-only. History is append-only and syncable.
  - **Amendment to ADR-002:** `PRAGMA user_version` is the only schema version; `meta` holds `device_id` and the clock state but not the `schema_version` ADR-002 lists. Key-value settings (`setting(key)`) and singleton device-only tables (`active_session`) carry no UUIDv7 `id`, `created_at` or `deleted_at`. A setting is reset by writing its default, never tombstoned; `change_log.entity_id` carries the key, so the field-level log and the sync direction are unchanged. ADR-002's natural key for `HabitCheck(habit, date)` stays as it was. Every other entity keeps the full ADR-002 shape.
  - Migrations are numbered SQL files embedded with `include_str!`, applied in order, one transaction each, `PRAGMA user_version` set at the end, forward-only. A database with a newer `user_version` is refused and the app runs degraded (in memory) rather than failing to start.
  - `crates/store` depends on `crates/core` for types, never the reverse; it must `cargo check` for the two mobile targets; it is not a WebAssembly target.
- **Consequences:** the sync engine in P10 reads `change_log` as is; it must treat `setting` rows as keyed by name. Every new table comes with a migration file, a repository module and a syncable or device-only marking in the spec. `PRAGMA user_version` is the only schema version. Tests use `open_in_memory(new_device_id)`. A pruning job for synced log rows comes with P10. The store is the single durable medium: no sidecar file or journal keeps a record whose write failed, so a session that ended while every write through exit failed resumes from its start snapshot on relaunch (#122); revisit only if a user reports it, and then as a tombstone file of ended session ids in `app_data_dir` consulted by `recover()`, not a journal of full records, which would duplicate `change_log`. Spec: [docs/specs/2026-11-08-focus-session-loop.md](specs/2026-11-08-focus-session-loop.md).

## ADR-013: One Rust state, many surfaces
- **Date:** 2026-11-08
- **Status:** accepted (2026-11-09, #110)
- **Context:** The timer shows on Today, in the menu bar and, from the next sub-projects, in a floating window, in full screen and in notifications. The spike already runs a second webview window with its own capability file (`apps/orasenda/src-tauri/src/spike/macos.rs`). Two surfaces that each keep their own timer would disagree.
- **Options considered:**
  1. **One owner in Rust managed state; every surface subscribes to the same events and sends the same commands; native surfaces are driven from Rust directly:** one truth, idempotent commands, windows never talk to each other.
  2. **The main webview owns the state and forwards it to other windows:** fails when the main window is hidden or its webview is throttled.
  3. **Shared state in the webview via a store library and Tauri's multi-window event relay:** two copies of the truth and a dependency on the webview staying awake.
- **Decision:** Option 1.
  - Product state lives once, in Tauri managed state in the app crate, changed only through the session service. Every command is safe to repeat from any window and returns an error rather than changing state when it does not apply.
  - Webview surfaces (main, mini timer, full screen, overlay) subscribe to the same events (`timer-tick`, `timer-milestone`) and render the latest payload; each extra window is its own HTML entry with its own capability file, as the overlay is.
  - Native surfaces (menu-bar item, notifications, later the Dock) are written from Rust in the same publish step; they need no IPC.
  - Rendering is a pure function of the latest event payload; one-shot effects come from milestone events, never from diffing ticks.
- **Consequences:** adding a surface means a new subscriber, never new state. The webview holds no product state beyond the last payload and local UI state (the current page, an open dialog). A surface that cannot listen renders its failure line, as the shell does for the clock. Spec: [docs/specs/2026-11-08-focus-session-loop.md](specs/2026-11-08-focus-session-loop.md).

## ADR-014: Settings — one object, one save chain, applied in Rust
- **Date:** 2026-11-09
- **Status:** accepted (2026-11-09, #163)
- **Context:** P1-A stored three timer settings and saved them from Today through one chained `settings_set` (`apps/orasenda/src/ipc/settingsQueue.ts`, conventions "Newest wins"). The Settings page (P1-B) adds a theme and a notification toggle. Sub-projects E, F and G and phases P5/P6 add many more (break lengths, shortcuts, single-key shortcuts, backups, roles). Some settings act outside the webview (the app appearance, later a global shortcut registration), and some can change without the page asking (a one-time migration, a recovered launch read, later sync). Every later spec needs one way to store, send, save and apply a setting.
- **Options considered:**
  1. **One `Settings` IPC object with every user setting. `settings_get` / `settings_set` send the whole object. The webview saves through the one chain. Rust validates, writes in one transaction, then applies side effects after unlock and emits `settings-changed`. Pages reload through the chain when it arrives:** reuses the proven chain, one place to validate, side effects can't diverge from what was stored. The object grows; a save writes (and logs to `change_log`) only the keys that changed.
  2. **One command per key (`settings_set_one(key, value)`):** smaller writes. Each key needs its own ordering, so the chain logic is duplicated or rewritten, and cross-field validation (Custom focus with break) gets harder.
  3. **The webview applies side effects itself (theme in CSS only, shortcuts registered from JS):** fewer Rust changes. It breaks ADR-013 (one Rust state), native surfaces (title bar, menu-bar menu) wouldn't follow, and a hidden webview couldn't apply anything.
- **Decision:** Option 1.
  - Every user setting is a `setting` row under a dotted key (`ui.theme`, `timer.preset`, `notify.session_end`, …), syncable unless its spec says device-only. Defaults live in Rust, and an undecodable value is logged and read as its default.
  - The IPC object is `Settings` (`deny_unknown_fields`). `settingsQueue.ts` lists every field (its compile-time check enforces it) and is the only sender of `settings_set`.
  - A save writes, and logs to `change_log`, only the keys whose value differs from the settings Rust last presented; a save that changes nothing writes no setting row. The same diff decides which side effects run.
  - Side effects of a saved setting (the app appearance now; shortcut registration in F) run in Rust after the write commits and after the session lock is released, never on an unsaved value. A failed save applies nothing.
  - `settings-changed` (the full object) is emitted after every successful write: a save, a migration or review, a recovered read, and later sync. Webviews react by queueing a `settings_get` through the chain, never by overwriting a value that is still being saved.
  - Values that depend on per-device OS state, such as a permission, are never stored as settings. They are read from the OS and travel in the view (`TimerView.notifications`).
- **Consequences:** a new setting means a key, a default, a field on `Settings` and its `SETTINGS_KEYS` entry, and its row on the Settings page. Because the webview echoes the whole object, an echo of the presented object never counts as a change, and sync sees one `change_log` row per real change. A setting with an OS side effect adds a `Host` method so tests can record it. If the object outgrows one transaction per save, a later ADR can split it by section without changing the event. Spec: [docs/specs/2026-11-09-settings.md](specs/2026-11-09-settings.md).

## ADR-015: Code-first design system on shadcn, Tailwind and Radix
- **Date:** 2026-11-10
- **Status:** accepted (owner, 2026-11-10). Amends ADR-001 (minimum macOS) and replaces the design-first rule in CLAUDE.md.
- **Context:** The design system's runtime is a hand-written 54 KB `bundle.js` edited in the artifact and copied into `design/system/` byte for byte. It has no build, no lint and no types checked against code, and every change is a serial artifact round (P1 Components ran seven tasks in series for that reason). P1's screens (C–G) are next, and each will touch components. The app already runs React 19, Vite 8 and TypeScript 7; the artifact still declares React 18. The macOS 13 minimum keeps the webview on Safari 16's engine, which rules out much of current CSS and forced hand-written placement code for menus and tooltips.
- **Options considered:**
  1. **Code-first: TSX components in `packages/ui` on shadcn, Tailwind v4 and Radix, with a closed theme generated from `tokens.json`; the artifact is a published build:** one source, typed, linted and reviewable like the rest of the app; parallel component work; Radix brings tested focus, layering and keyboard behaviour. A build pipeline for the artifact has to be written, and the live artifact loses hand edits.
  2. **Stay design-first until the end of P1, as CLAUDE.md planned:** no migration now; every screen task pays a serial artifact round and a copy, and the migration is larger later.
  3. **Code-first in plain TSX with CSS modules on today's `os-*` classes, no shadcn or Radix:** smallest change to the CSS; keeps all hand-written focus and placement code, and nothing stops raw values in CSS.
- **Decision:** Option 1.
  - Components are TSX only (no `createElement`), one file per component in `packages/ui/src/components/ui/<kebab>.tsx` with its README (`<kebab>.md`) and tests beside it; props inline; one `index.d.ts` from `isolatedDeclarations`.
  - Styling is Tailwind v4 with a closed `@theme` generated from `packages/tokens/tokens.json` (moved from `design/system/`). Arbitrary values are rejected by lint. shadcn's semantic variables map to Orasenda tokens; `destructive` is `critical`.
  - Behaviour primitives come from Radix (`radix-ui`), starting from shadcn's generated files, rewritten to each README contract. The public names and props stay those of the design system.
  - Vite builds the app, the library, the artifact's classic `bundle.js` and its self-built React 19 scripts. `design/system/` is a git-ignored build output; the controller publishes it from `main` after each merge with `"editing": "code"`.
  - The minimum macOS rises from 13.0 to **15.8.2** (the latest Sequoia), so the webview engine is the one macOS 15.8.2 ships.
- **Consequences:** CLAUDE.md "Keeping the design system in sync" is code-first from now on; the artifact is read-only by hand. Users on macOS 13 and 14 cannot install Orasenda. The P1 Components engine table and design-first steps are superseded; T5–T7 resume in TSX. The migration runs as a foundation PR and one PR per component (spec: [docs/specs/2026-11-10-code-first-components.md](specs/2026-11-10-code-first-components.md)). A new component or token is added in code and its README, then published; there is no separate design round. Reviews never read generated output.

## ADR-016: Windows and surfaces
- **Date:** 2026-11-12
- **Status:** accepted (2026-11-12, by D8, #339). Amended by ADR-019 (full screen is the main window in native full screen; the `focus-<display>` window goes) and ADR-020 (keys: two bindings per action, one registry).
- **Context:** ADR-013 makes every surface a subscriber to one Rust state, and the spike proved a Tauri window can be turned into a non-activating panel (ADR-004). P1-D adds the first product windows beside `main`: a full-screen Focus window on a chosen display and a floating timer over other apps, including full-screen ones, plus app-wide shortcuts that must work from any of them. Without one rule for window kinds, levels, keys, positions and permissions, each later window (E's states, F's capture panel, P6's blocking overlay) would choose its own.
- **Options considered:**
  1. **One window kind per surface, each its own HTML entry and capability file; levels and Space behaviour set in `crates/platform-macos`; app-wide shortcuts as native menu accelerators handled in Rust; window positions in a device-only store table:** each window gets only the commands it uses; shortcuts fire once from any window; positions survive relaunch without syncing.
  2. **One webview that changes role (main doubles as full screen; native full screen for the Focus view):** fewer windows. Native full screen blacks out other displays when "Displays have separate Spaces" is off, and the main window can't be in two places.
  3. **Shortcuts bound in each webview, positions in `localStorage`:** no Rust menu work. Every window repeats the bindings, a shortcut can fire twice beside a menu item, a hidden or unfocused webview can't react, and positions live outside the store (ADR-002).
- **Decision:** Option 1.
  - **Window model:** `main` (normal window; closing hides it; since ADR-019 it is also the full-screen view); `focus-<display>` (*removed by ADR-019*; borderless, sized to that display's frame, `NSNormalWindowLevel`, `fullScreenAuxiliary | moveToActiveSpace`, never macOS native full screen, at most one per display, nothing remembered); `floater` (a key-capable `NSPanel` by the ADR-004 class swap, `nonactivatingPanel`, `NSFloatingWindowLevel`, `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`, `hidesOnDeactivate` off; it becomes key only on a click or an explicit open and never activates the app); `capture` (the capture panel, F6: a key-capable `NSPanel` by the same class swap, `nonactivatingPanel`, `NSFloatingWindowLevel`, `canJoinAllSpaces | fullScreenAuxiliary | transient | ignoresCycle`, `hidesOnDeactivate` off; `capture.html` and `capture.json`; `panel-width` wide and a fixed 520 points high (every pad state fits; the page has no window permission to resize itself), centred in the upper third of the display under the pointer, nothing remembered; opened by ⌃⌥N, the menu-bar item and ⌘K, key without activating the app, and closed only through its pad, so a second open focuses its text; it can only save a note, close itself and read the settings); `dev` and `overlay` stay spike-only. AppKit calls for these live in `crates/platform-macos` (ADR-010), on the main thread.
  - **Keys** (*amended by ADR-020: the keys below become registry bindings*)**:** shortcuts that must work from more than one window (⌘⇧F, ⌘⇧T, ⌘K, and ⌘, already) are native menu accelerators handled in Rust, never also bound in a webview. Keys that belong to one surface (Today's ⌘↩, ⌘⇧↩, ⌘., ⌘1–6; the Focus window's ⌘↩, ⌘. and Esc; the floater's Space, Return and Esc while it is key) stay in that webview. The menu-bar menu shows no accelerator text for items the app menu owns.
  - **Frame memory:** a window that remembers its frame stores it in the device-only `window_frame` table, keyed by window and display, in display-relative points, with no `change_log` rows (ADR-012). Only the floater does so now.
  - **Capabilities:** one file per window kind (`focus.json` matches `focus-*`). A secondary window reads the view with `timer_view`, which doesn't drain pending milestones, and never sends a whole `Settings` object (ADR-014). Single-field saves go through a Rust command.
- **Consequences:** a new window means a new HTML entry, a capability file with a test of its exact permissions, a window spec with a Rust test, and a line in this ADR's model. Floater behaviour rests on the class swap, so it is re-verified on every tao or objc2 upgrade, as ADR-004 says. Whether menu key equivalents reach the app while the non-activating floater is key is checked by hand in D; if they don't, a local `NSEvent` monitor in `crates/platform-macos` handles them, and the floater's Space, Return and Esc too, calling the same Rust commands. Spec: [docs/specs/2026-11-12-focus-views.md](specs/2026-11-12-focus-views.md).

## ADR-017: Global shortcuts
- **Date:** 2026-11-12
- **Status:** accepted (spec [Hotkeys and capture](specs/2026-11-12-hotkeys-and-capture.md); adapter in [#405](https://github.com/arkgast/orasenda/pull/405)). Amended by ADR-020: each global shortcut becomes an action's *Everywhere* binding, and the `keys.start_pause` and `keys.capture` keys become legacy keys read once.
- **Context:** P1-F adds system-wide shortcuts (⌃⌥F start or pause, ⌃⌥N capture) and single-key shortcuts inside surfaces. ADR-014 already rules out registering from JS, and ADR-016 makes app-wide keys native menu accelerators handled in Rust. A global shortcut can fail to register, because another app holds it, and VoiceOver takes ⌃⌥ keys before any app sees them.
- **Options considered:**
  1. **`tauri-plugin-global-shortcut` (2.4.1, global-hotkey 0.8) called only from Rust, behind a `ShortcutRegistrar` trait:** maintained by Tauri, covers macOS and Windows, and reports failures. One more dependency.
  2. **Our own Carbon `RegisterEventHotKey` in `crates/platform-macos`:** no dependency, but unsafe FFI to maintain and a second implementation for Windows.
- **Decision:** Option 1 (owner, 2026-11-12).
  - Each global shortcut is a syncable setting (`keys.start_pause`, `keys.capture`) holding a canonical accelerator (modifiers Control, Alt, Shift, Super, then the `KeyboardEvent.code`, joined by `+`) or `"off"`.
  - **Register before saving:** a change registers the new shortcut first and saves only if that succeeds, then unregisters the old one. A failure saves nothing and keeps the old one.
  - Registered once, system-wide. The menu-bar item shows it as inert text, never as a live accelerator (critique F10). Registration status (`registered | off | failed`) lives in memory and is never stored.
  - Single-key shortcuts belong to one surface, are bound in that webview, and honour `keys.single_key` (WCAG 2.1.4). A surface whose keys are its only controls and act only while it has focus (the floater) is exempt.
- **Consequences:** a new global shortcut means a setting key, a Settings › Keyboard row and a handler in Rust. A new single key means a line in the All shortcuts list and a check of `singleKey`. Plugin upgrades go through baton:deps. Mobile builds keep the plugin behind `#[cfg(desktop)]`.

## ADR-018: Data portability in SQLite files
- **Date:** 2026-11-12
- **Status:** accepted (2026-11-13; spec [Data portability](specs/2026-11-12-data-portability.md), the store and service parts built by G1–G6, the last in #440)
- **Context:** P1-G adds export, import, automatic backups, restore and "Delete all data". ADR-002 named a versioned JSON bundle for export. Everything Orasenda stores is one SQLite file, and `PRAGMA user_version` with the existing migrations already upgrades older files (ADR-012).
- **Options considered:**
  1. **Whole SQLite copies (`VACUUM INTO`) for export and backups:** one fast path, no format to version, older files upgrade through the existing migrations. Not readable by people or other tools.
  2. **A JSON table-mirror bundle:** readable and portable, but a second format to keep in step with the schema, and slower to write.
  3. **JSON for export, SQLite for backups:** each format fits its job, at the cost of two code paths.
- **Decision:** Option 1 (owner, 2026-11-12: "the most efficient and fastest option").
  - Import opens a temporary copy of the file (so migrations never touch the user's file), refuses a newer `user_version`, and **merges** the syncable rows by id (by key for settings): the later `updated_at` wins and tombstones count as changes. Device-only tables and `change_log` in the file are ignored; merged rows log `change_log` as normal writes.
  - Replacing the live database (Restore, Delete all data) never happens while the store is open: a pending-swap file is left and applied at the next launch before `Store::open`.
- **Consequences:** a schema change needs no export mapper; every migration must keep working on any older file, which it already must. A readable export, if ever wanted, is built from the same row reader. P10 sync can reuse the merge rules.


## ADR-019: Full screen is the main window in native macOS full screen
- **Date:** 2026-11-13
- **Status:** proposed (spec [Structure, keys, focus and Settings](specs/2026-11-13-polish-structure-keys-focus-settings.md)). Amends ADR-016.
- **Context:** ADR-016 made full screen a second, borderless `focus-<display>` window and rejected macOS native full screen, because native full screen blacks out the other displays when "Displays have separate Spaces" is off. In use, the second window means two copies of the timer page, a display menu on Today's button, a "Leave full screen?" dialog, and a window to create, place and close for every entry. The owner asked for full screen to be the main window itself, entered at once (sub-project H, 2026-11-13).
- **Options considered:**
  1. **The main window in native full screen (`setFullscreen`), with the nav rail and page chrome hidden:** one window, one page tree, macOS draws the transition and the Space, and the green button and the Globe-F key mean the same thing. With "Displays have separate Spaces" off, the other displays go blank while it is full screen.
  2. **Keep the `focus-<display>` window (ADR-016):** works with every Spaces setting; keeps the second window, its capability, its frame logic and the dialog.
  3. **The main window resized to a display's frame, borderless, without native full screen:** no Space change; re-creates by hand what macOS does, and fights the window's own frame memory and the Dock.
- **Decision:** Option 1 (owner, 2026-11-13).
  - Full screen is a state of `main`: the window enters native full screen and the webview shows only the focus view (no nav rail, no page header).
  - The window's native full-screen state is the one source of truth. Entering it by any path (our command, the green button, Globe-F) shows the focus view; leaving it by any path restores the page the user was on.
  - Entering and leaving use Tauri's `set_fullscreen`. `crates/platform-macos` only observes AppKit's did-enter, did-exit and did-fail notifications. One transition runs at a time; a did-fail or a timeout ends it.
  - "Full screen on another display" leaves full screen if needed, waits for did-exit, moves `main` to that display, then enters again.
  - The floater and the capture panel keep `fullScreenAuxiliary`, so they show over Orasenda's full-screen Space as they do over other apps.
  - An open overlay (palette, popover, dialog) consumes Esc first; otherwise Esc leaves at once. There is no "Leave full screen?" dialog. A spike checks Esc handling in native full screen before the view is built.
- **Consequences:** `focus.html`, the `focus` capability, `focus-<display>` window code and the Focus page's window wiring are deleted, and `main`'s capability gains the full-screen commands. With "Displays have separate Spaces" off, other displays go blank during full screen; this is accepted and named in the spec's FAQ. Window-level tests move from "a window per display" to "main's full-screen state". Spec: [docs/specs/2026-11-13-polish-structure-keys-focus-settings.md](specs/2026-11-13-polish-structure-keys-focus-settings.md).

## ADR-020: Two bindings per action and one shortcut registry
- **Date:** 2026-11-13
- **Status:** proposed (spec [Structure, keys, focus and Settings](specs/2026-11-13-polish-structure-keys-focus-settings.md)). Amends ADR-016 (Keys) and ADR-017.
- **Context:** Keys are defined in at least five places today: the menu accelerators (`apps/orasenda/src-tauri/src/menu/focus_menu.rs:22-24`), the menu-key clash list (`crates/service/src/keyboard/accelerator.rs` `MENU_KEYS`), the two global shortcuts (`crates/service/src/api/keyboard.rs:17-22`), the palette's hints (`apps/orasenda/src/app/palette/paletteCommands.ts:43-76`) and the floater's key table (`crates/platform-macos/src/windows/keys.rs`). Only start or pause and capture can be changed, and only system-wide. The owner wants every action to be reachable both inside Orasenda and from any app, each binding editable (sub-project H, 2026-11-13).
- **Options considered:**
  1. **Two bindings per action, one registry in Rust:** *In Orasenda* is a native app-menu item with an accelerator (works in every Orasenda window, shows in the menu bar); *Everywhere* is a global shortcut through `tauri-plugin-global-shortcut` (ADR-017). One table feeds the menu, the registrar, the single-key handlers, the palette hints and Settings.
  2. **One binding per action with a "global" switch:** fewer fields; a user can't have ⌘F inside Orasenda and ⌃⌥⌘F from other apps at once.
  3. **Keep two separate lists (menu keys fixed, global keys editable):** no new model; the menu keys stay hard-coded and can clash with new global ones unnoticed.
- **Decision:** Option 1 (owner, 2026-11-13).
  - The registry lives in `crates/service/src/keyboard/`. Each entry has an id, a label, a description, where it works, and defaults for both bindings. It is sent to the webview in `KeyboardView`; no binding is hard-coded anywhere else.
  - *In Orasenda* needs ⌘ or ⌃; *Everywhere* needs ⌘, ⌃ or ⌥. Either may be empty. Each has Restore default, which is refused if another action holds the default.
  - A chord may be used once across all bindings, fixed keys (⌘K, ⌘,, ⌘↩, ⇧⌘↩, ⌘., ⌘1–6, Esc in full screen) and the app menu's own items included. Saves refuse a clash. Because import and sync write settings directly, one repair pass at load and after each import or sync walks the registry in order and turns the later of two clashing slots off, saying so on its row.
  - While a recorder records, Rust suspends every menu accelerator (standard items included), global shortcut and single key, and restores them when recording ends, the window loses focus or closes, or the page reloads; the suspension is never stored.
  - The *Everywhere* binding keeps ADR-017's rules: register before saving, never a live tray accelerator, status `registered | off | failed` in memory.
  - One module with tests holds two system-key lists. Keys macOS never delivers (⌘Tab, ⌘Space when Spotlight holds it, and similar) are refused in both slots. Other well-known keys (⌘Q, ⌘W, ⌘C and the rest, and any ⌥-only chord) warn in plain words and ask once before they are used *Everywhere*.
  - Bindings are syncable settings, `keys.app.<action>` and `keys.global.<action>`. The old `keys.start_pause` and `keys.capture` rows are folded once per device (a device-only `keys.legacy_folded` flag) and never written again; an imported file with only the old keys is folded again on import.
  - Single keys (Space and P on Today, Space in full screen) stay per surface behind `keys.single_key` (ADR-017, WCAG 2.1.4). They are registry entries without bindings.
  - The floater is a non-activating panel, so menu accelerators may not reach the app while it is key. A spike decides one route: the app menu (if accelerators arrive) or the local `NSEvent` monitor in `crates/platform-macos`, driven by the registry. Either way no chord is bound in a webview, so ADR-016's rule holds. Every action path (menu, monitor, global, tray, webview control) goes through one Rust entry point that drops a duplicate request for the same action within a short window.
  - Menu handlers always act on `main` or the floater, whatever window is key, and are ignored while the capture panel is key.
- **Consequences:** a new action is one registry entry plus its handler; the menu, Settings and palette pick it up. Rebinding *In Orasenda* rebuilds the menu item's accelerator. The registry's system-key list must be kept current by hand. If Board gains search, ⌘F (full screen's default) must move, because ⌘F is the usual Find key.

## ADR-021: Frontend layers and import direction
- **Date:** 2026-11-13
- **Status:** proposed (spec [Structure, keys, focus and Settings](specs/2026-11-13-polish-structure-keys-focus-settings.md)). Every later frontend spec follows it.
- **Context:** `apps/orasenda/src` has `app/`, `features/*`, `ipc/`, `test/` and `dev/`, and nothing stops a feature importing another. Today `focus`, `floater` and `settings` import `features/timer` and `features/today` (presets, `PresetSummary`, `statusLine`, `cadenceOffers`), and `board`, `capture`, `floater`, `focus`, `settings` and `today` import from `app/` (for example `features/focus/FocusPage.tsx:3-13`, `features/settings/Settings.tsx:3-8`). Each screen task now has to read across features to know what it may change.
- **Options considered:**
  1. **Five layers, imports only downward, enforced by Biome:** `surfaces → app → features → domain → shared` (order amended 2026-11-13 by the controller's plan-review ruling: the main entry mounts the `app/` shell, so surfaces sit above it). Shared domain code moves to `domain/`; features never import each other.
  2. **Feature folders with an index file as the public face:** fewer moves; nothing stops deep imports, and shared code still sits inside one feature.
  3. **A convention in `docs/conventions.md` only:** no lint work; drifts at the first rushed PR.
- **Decision:** Option 1 (owner, 2026-11-13).
  - `surfaces/<main|focus|floater|capture>/`: each window's `main.tsx` entry only; the `.html` files point here, and `*Page.tsx` roots stay in their features. Surfaces may import every layer below, `app/` included.
  - `app/`: shell, routing, providers, `PageBoundary`, the palette. `focus` goes with ADR-019. `dev/` (spikes and layout scenarios) stays outside the layers.
  - `features/<name>/`: one screen or panel each. Subfolders `components/`, `hooks/`, `model/` (pure logic) and `api/` (IPC adapters) appear only when a feature has three or more files of that kind.
  - `domain/<name>/`: code more than one feature needs (timer, presets, cadence, keyboard).
  - `shared/`: the IPC client and bindings, generic hooks, lib, and test fixtures and builders. It imports nothing above it.
  - Imports go only downward. Features never import each other. Tests, their support files and `shared/test/**` may import upward to render a whole surface, never sideways into another feature.
  - Cross-layer imports use aliases (`@surfaces/`, `@app/`, `@features/`, `@domain/`, `@shared/`, `@styles/`). Biome `noRestrictedImports` (Biome 2.6.6, `patterns`) in per-layer, depth-specific `overrides` (each restating its full pattern list) bans aliases above a layer and relative `../` imports that cross a layer, with separate overrides for tests, `*.support.tsx` and `dev/`. A lint fixture per rule must fail in CI.
- **Consequences:** a one-time move (H1), done as move-only PRs with unchanged test totals. `docs/conventions.md` gains the rules, naming and the 500-line ceiling in one place. A later piece of code needed by two features moves to `domain/` in the PR that needs it.
