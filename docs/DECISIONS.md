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
  - **From P1:** SQLite through `rusqlite` (bundled) in a new `crates/store`, so `crates/core` stays free of a database and can compile to WebAssembly. WAL mode; versioned migrations via `PRAGMA user_version`. Every entity has a UUIDv7 `id`, `created_at`, `updated_at` and a `deleted_at` tombstone. A `meta` table holds `schema_version`, a random `device_id` and the clock state. Every write appends **one row per changed field** to `change_log(seq, hlc, device_id, entity, entity_id, field, value, synced_at)` in the same transaction. Each repository declares whether its entity is syncable or device-only; `BypassEvent` reasons and raw `UsageRecord`s are device-only. Kanban and checklist order use fractional-index strings; `HabitCheck` is keyed by habit and date; sessions and usage records are append-only. Export and import use a versioned JSON bundle (CSV for usage).
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
- **Status:** proposed
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
- **Status:** proposed
- **Context:** ADR-002 fixes the storage shape (SQLite in `crates/store`, UUIDv7 ids, tombstones, one `change_log` row per changed field, syncable versus device-only entities, versioned migrations) but not how code uses it. Every P1 sub-project adds tables, so the API pattern must be settled with the first one.
- **Options considered:**
  1. **One `Store` with a mutex-guarded connection, closure-scoped transactions, repository modules, and a typed `set_fields` that writes the row and the change log together; device-only repositories skip the log by type:** small, testable with an in-memory database, hard to bypass the log by accident.
  2. **An ORM or query builder (diesel, sea-orm, sqlx):** more code and compile time, async or macro machinery the app does not need, and the change log would still be hand-written.
  3. **Repositories that write SQL freely and remember to log:** the log becomes a convention and drifts.
- **Decision:** Option 1.
  - `Store::open(path)` and `Store::open_in_memory()`; one `rusqlite` connection behind a `Mutex`; WAL mode; `store.read(|txn| …)` and `store.write(|txn| …)` closures, one SQLite transaction each.
  - Repositories are modules with functions over `&mut Txn` (`settings::set`, `focus_sessions::insert`, …). A syncable repository writes through `txn.set_fields(entity, id, &[(field, value)])`, which updates or inserts the row and appends one `change_log` row per field stamped with a hybrid logical clock from core (`clock::Hlc`) and the device id. A device-only repository writes rows directly and is marked device-only in its module doc; it never touches `change_log`.
  - Live or ephemeral state (the active session, later window positions, bypass reasons, raw usage) is device-only. History is append-only and syncable.
  - **Amendment to ADR-002:** `PRAGMA user_version` is the only schema version; `meta` holds `device_id` and the clock state but not the `schema_version` ADR-002 lists. Key-value settings (`setting(key)`) and singleton device-only tables (`active_session`) carry no UUIDv7 `id`, `created_at` or `deleted_at`. A setting is reset by writing its default, never tombstoned; `change_log.entity_id` carries the key, so the field-level log and the sync direction are unchanged. ADR-002's natural key for `HabitCheck(habit, date)` stays as it was. Every other entity keeps the full ADR-002 shape.
  - Migrations are numbered SQL files embedded with `include_str!`, applied in order, one transaction each, `PRAGMA user_version` set at the end, forward-only. A database with a newer `user_version` is refused and the app runs degraded (in memory) rather than failing to start.
  - `crates/store` depends on `crates/core` for types, never the reverse; it must `cargo check` for the two mobile targets; it is not a WebAssembly target.
- **Consequences:** the sync engine in P10 reads `change_log` as is; it must treat `setting` rows as keyed by name. Every new table comes with a migration file, a repository module and a syncable or device-only marking in the spec. `PRAGMA user_version` is the only schema version. Tests use `open_in_memory()`. A pruning job for synced log rows comes with P10. Spec: [docs/specs/2026-11-08-focus-session-loop.md](specs/2026-11-08-focus-session-loop.md).

## ADR-013: One Rust state, many surfaces
- **Date:** 2026-11-08
- **Status:** proposed
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
