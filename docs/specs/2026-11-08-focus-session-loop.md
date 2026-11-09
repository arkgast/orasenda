# Focus session loop — Spec

- Status: approved (owner, 2026-11-08)
- Date: 2026-11-08
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP P1](../ROADMAP.md), [SPEC §2.1 and §4](../SPEC.md), [app shell spec](2026-11-07-app-shell.md), [ADR-001](../DECISIONS.md#adr-001-tech-stack-and-code-sharing), [ADR-002](../DECISIONS.md#adr-002-local-storage-ready-for-sync), [ADR-007](../DECISIONS.md#adr-007-typed-ipc-contract-with-tauri-specta-2), [ADR-010](../DECISIONS.md#adr-010-platform-code-layout), [ADR-011](../DECISIONS.md#adr-011-time-and-scheduling), [ADR-012](../DECISIONS.md#adr-012-store-crate-api), [ADR-013](../DECISIONS.md#adr-013-one-rust-state-many-surfaces), [CONTEXT.md](../../CONTEXT.md), design system [`TimerRing`](../../design/system/components/TimerRing/README.md), [`StartButton`](../../design/system/components/StartButton/README.md), [`MenuBarTimer`](../../design/system/components/MenuBarTimer/README.md), [`ModeChip`](../../design/system/components/ModeChip/README.md), [`InlineNotice`](../../design/system/components/InlineNotice/README.md), [`NavRail`](../../design/system/components/NavRail/README.md)

## TL;DR
- The first P1 sub-project: a **focus session that runs end to end**. Pick a preset on Today, press *Start focus*, watch the ring count down, see the digits in the menu bar, close the window without stopping anything, get one notification at the end, and find the session saved in SQLite with its change-log trail.
- Product logic is a **pure timer engine in `crates/core`** fed with the current time; a new **`crates/store`** holds SQLite with the sync-ready shape of ADR-002; the app crate owns one scheduler thread, the native menu-bar item, the windows and the notification.
- The **wall clock is the only time base**: sleep counts, a late tick cannot drift the count, and a session that ends while the Mac sleeps or Orasenda is closed ends at its planned end.
- Three decisions get ADRs: time and scheduling (ADR-011), the store crate API (ADR-012), one Rust state with many surfaces (ADR-013). Later P1 specs follow them.
- Breaks, the two-minute cue, the mini timer, full screen, the capture pad and export are later sub-projects (see [P1 sub-projects](#context-p1-sub-projects)).

## Change in a nutshell
Today, after `pnpm --filter orasenda tauri dev`:

Idle, before the first session:

```
│ Today                                                      │
│                                                            │
│                 ╭────────────╮        ○ No session         │
│                 │            │                             │
│                 ╰────────────╯                             │
│                                                            │
│   (•) Classic 25/5   ( ) 50/10   ( ) Deep Block 90   ( ) Custom
│                                                            │
│              [ Start focus ]   Just 2 minutes              │
│              Realistic finish · 15:20                      │
```

One second after *Start focus*:

```
│ Today                                                      │
│                                                            │
│                 ╭────────────╮        ● Focus              │
│                 │   24:59    │   Realistic finish · 15:20  │
│                 ╰────────────╯                             │
│                                                            │
│   (•) Classic 25/5   ( ) 50/10   ( ) Deep Block 90   ( ) Custom
│                                                            │
│                 Pause        End session                   │
```

Menu bar, at the same moment: `● 24:59`. Close the window: the process stays, the menu bar keeps counting. Pause from the quiet button or the menu-bar menu: the arc freezes, the chip says "Paused", the menu bar shows the pause bars. At `00:00` one macOS notification says "Focus session complete.", the menu bar returns to its idle glyph, and Today shows the quiet line "Session ended." above the Start button again. Quit Orasenda at `12:00` and relaunch two minutes later: the ring shows `10:00` and keeps going.

Behind it: `crates/core::timer` decides everything from `now_ms`; `crates/store` writes `focus_session` once at the end and keeps the live session in a device-only `active_session` row; the app crate's `session-scheduler` thread wakes once a second, advances the engine, emits `timer-tick` and sets the menu-bar title.

## Context: P1 sub-projects
P1 "Focus Core" is split into five sub-projects, each with its own spec, plan and implementation cycle. This spec is **A**. The split is recorded here so later specs can refer to it.

| # | Sub-project | Scope | Depends on | Size |
|---|---|---|---|---|
| **A** | **Focus session loop** (this spec) | Timer engine in core; `crates/store` skeleton (migrations, `meta`, `change_log`, settings, sessions); scheduler and App Nap assertion; IPC; Today (StartButton, TimerRing, preset choice, Pause and End); native menu-bar item; hide-on-close; session-end notification; relaunch recovery. | none | 8 tasks |
| **B** | Session cadence | Breaks (short, long after N rounds), "Just 2 minutes" with the keep-going prompt, flow extension "+10 min" capped at 2, two-minute warning (ring, chip and menu bar switch to `warning`, one chime, one `InlineNotice`, one notification), deep-hours cap notice, session intent line. | A | 6 tasks |
| **C** | Timer surfaces | Floating mini timer window (`MenuBarTimer compact:false`), full-screen mode (`FullScreenFocus`, exit `Dialog`), the ⌘K palette with timer commands. | A (B for `warning`) | 5 tasks |
| **D** | Capture pad | Global hotkey, `CapturePad` in its own window, `capture_note` entity (text, internal or external, session), a plain Inbox list until P2's board. | A | 4 tasks |
| **E** | Data portability | Export and import of a versioned JSON bundle, automatic backups (`VACUUM INTO`, rotating), Settings page, "Delete all data" (the one `critical` button). | A, D | 5 tasks |

**Build order: A → B → (C ∥ D) → E.** A is a vertical slice rather than a store layer because P1's exit criterion is "usable daily as a focus timer", because the two real risks (timer truth while hidden or asleep, the menu-bar and hide-on-close lifecycle) are only proven end to end, and because ADR-002 already fixes the store's shape, so one real entity is enough to settle its API.

## Problem
The shell keeps time in Rust and renders it in React (`apps/orasenda/src-tauri/src/ticker.rs:15-28`, `apps/orasenda/src/App.tsx:36-57`), but it has no product behaviour: the only command is `app_info`, the rest are spike commands (`apps/orasenda/src-tauri/src/lib.rs:25-34`), closing the window quits the app (no `CloseRequested` handler in `lib.rs`; recorded in the [shell spec](2026-11-07-app-shell.md) line 123 and its FAQ), the menu bar is empty (`tauri` has no `tray-icon` feature: `apps/orasenda/src-tauri/Cargo.toml:22`, pin at `Cargo.toml:16`) and nothing is stored (no `rusqlite` or `uuid` in any `Cargo.toml`). People with ADHD need the time visible at all times and starting to cost almost nothing (SPEC §1.7). The first daily-usable build is a focus timer that survives a hidden window, sleep and a relaunch, and the storage it writes must already have the shape sync will need (ADR-002), because retrofitting that is expensive.

## Goals / Success criteria
1. On Today, choosing a preset and pressing *Start focus* starts a session whose ring, chip and menu-bar title agree to the second; Pause, Resume and End work from the Today buttons and from the menu-bar menu.
2. With the window hidden (⌘H), minimized or closed, the menu-bar title keeps counting and the session ends on time: after 25 minutes hidden, the end is within 1 s of the planned end.
3. After `pmset sleepnow` across the planned end, the session is recorded as completed at its planned end and exactly one notification arrives after wake.
4. Quitting mid-session and relaunching resumes the session with the true remaining time; relaunching after the planned end records the session as completed at the planned end and shows one notice.
5. Every completed or ended session is one `focus_session` row plus one `change_log` row per field, written in one transaction; the live session is one device-only `active_session` row that is empty when idle.
6. `crates/core` stays free of `tauri`, `tao`, `wry`, `objc2` and `rusqlite` in its dependency tree and of `cfg(target_os` in its source; `crates/core` and `crates/store` both `cargo check` for `aarch64-apple-ios` and `aarch64-linux-android`; `./scripts/ci.sh` enforces all three (the source check is a new grep step, see [Testing](#testing-strategy)).
7. Orasenda's CPU stays below 0.5 % on average over 5 minutes while a session runs with the window hidden; the Activity Monitor "App Nap" column reads "No" during a session.
8. The UI uses only design-system tokens and components; both themes render; VoiceOver reads the ring's name, the state word, the buttons and the menu-bar menu; everything works by keyboard.
9. ADR-011, ADR-012 and ADR-013 are accepted in `docs/DECISIONS.md` by the last task; `CONTEXT.md` defines the terms used here.

## Non-goals
- Breaks and long breaks, the keep-going prompt after "Just 2 minutes" (in A the button only starts a 2-minute session), flow extension, the two-minute warning, the deep-hours cap, the intent line, sound (B).
- The floating mini timer, full-screen mode, the command palette (C).
- The capture pad and the global hotkey (D).
- Export, import, backups, the Settings page, deleting data (E).
- Linking a session to a task (P2); onboarding (P3); sync (P10).
- A menu-bar-only mode (hiding the Dock icon); see [Open questions](#open-questions).
- Re-basing the count on a backward clock change (see [Behavior](#behavior--edge-cases)).
- Windows tray behaviour beyond "the advisory CI job compiles and the lib tests pass"; mobile behaviour beyond `cargo check`.
- New design-system components or tokens. The only design-system change is one README note (the `MenuBarTimer` menu-bar glyphs), made design-first: artifact, then `design/system/`.

## Users & permissions
One local user, no accounts. Least privilege for the webview.

| Caller | Can | Cannot |
|---|---|---|
| Webview `main` | `app_info`; `timer_state`, `timer_start`, `timer_pause`, `timer_resume`, `timer_stop`; `settings_get`, `settings_set`; listen to and unlisten from events | file system, shell, http, posting notifications (Rust does, through `Notifier`), any spike command in a release build |
| Orasenda process | read and write under `app_data_dir()`; show a menu-bar item; post a user notification once the user has allowed it; hold an App Nap activity while a session runs | network; paths outside `app_data_dir()`; any TCC permission other than Notifications |

- Each new command goes into the `COMMANDS` list in `apps/orasenda/src-tauri/commands.list.rs` (included by `build.rs:1` and passed to `AppManifest::commands` at `build.rs:10`) and into `capabilities/main.json` (today it grants `allow-app-info` plus listen, unlisten and the spike commands: `apps/orasenda/src-tauri/capabilities/main.json:6-15`).
- **Notification permission** is requested when the user starts the first session (SPEC §2.7: permissions at the moment of need). While the authorization is `notDetermined`, Today shows one line under the Start button: "Orasenda can tell you when a session ends, even when its window is hidden." `timer_start` starts the session first and then asks the system; the start never waits for the answer. The line disappears as soon as the authorization is anything but `notDetermined`. If denied, the end is shown on Today, the menu bar returns to idle, and the app never asks again; macOS System Settings is the way back. "Already asked" is not stored by Orasenda: the system's own authorization status is read at launch (on a background thread, so the view starts `unavailable` until it arrives), after each request and again at a completed end before posting; every change of the status publishes one `timer-tick`.
- **Not `tauri-plugin-notification`.** Read from the 2.8.0 crate source (the latest 2.x on crates.io on 2026-11-08): its desktop side reports `Granted` without ever asking (`src/desktop.rs:193-206`), posts through `notify-rust` and `mac-notification-sys` (the deprecated `NSUserNotification` API), and impersonates `com.apple.Terminal` under `tauri dev` (`src/desktop.rs:518-524`). Orasenda uses a `Notifier` trait in core, implemented in `crates/platform-macos` on `UNUserNotificationCenter` (`objc2-user-notifications`, already in `Cargo.lock` at the Tauri-matched 0.3.2). No JS notification permission exists.

## Tenancy & localization
- Single user, single device.
- **Rust produces every time string** (ADR-011): the countdown `"24:59"`, the spoken label `"24 minutes 59 seconds"`, the menu-bar title and the finish time `"15:20"`. The webview never computes time.
- The finish time and the wall clock use a **UTC offset and an hour cycle passed in from the app crate** through a core `LocalTime` trait: `utc_offset_min(at_epoch_ms)` and `hour_cycle()` (`H12` or `H23`). `crates/platform-macos` implements it with `NSTimeZone.localTimeZone.secondsFromGMTForDate` and the locale's hour cycle (`NSLocale` formatted template plus the `AppleICUForce24HourTime` default), which fixes the known WKWebView limitation that ignores the 24-hour setting (`docs/spikes/2026-11-07-macos-blocking.md:118`, shell spec line 66). The offset is taken **at the instant being formatted**, so a finish time across a DST change is right. Other targets use core's `UtcLocalTime` (offset 0, `H23`) until they get a platform crate; Windows is advisory and mobile has no features, so this is acceptable and noted here. No `time` or `chrono` dependency.
- The shell's `clock-tick` now carries the formatted wall clock (`clock: String`) and, while idle, the finish preview for the chosen preset; `timer-tick` carries the planned finish while a session runs.
- Timestamps are UTC epoch milliseconds, so a DST change never alters a remaining time.
- Copy is English only.

## Domain model
Terms are defined in [CONTEXT.md](../../CONTEXT.md).

### Core: `crates/core::timer` (pure; `now_ms` passed in; no `SystemTime::now()`)
- `Preset` — `classic | fifty_ten | deep_block | custom | quick`, serialized snake_case. `CustomSpec { focus_min: u16, break_min: u16 }`, valid when `5 ≤ focus_min ≤ 180` and `1 ≤ break_min ≤ 60`. `PresetSpec { focus_ms, short_break_ms, long_break_ms, rounds_before_long: u8 }`; `Preset::spec(&self, custom: &CustomSpec) -> Result<PresetSpec, TimerError>`: Classic 25/5/15 after 4, 50/10/20 after 4, Deep Block 90/15/30 after 2, `quick` a fixed 2-minute focus (`QUICK_START_MS`) with Classic's breaks. `quick` is what "Just 2 minutes" starts; it is never the selected preset in settings, it is stored as `focus_session.preset = 'quick'` (a TEXT column, so B's keep-going prompt and E's export need no migration), and it is exempt from the Custom minimum. The break fields exist now so B adds no new type; A never starts a break.
- `Phase` — `focus` only in A. Serialized lowercase. B adds `break`.
- `Session` (the engine) — `Idle | Running { id, preset, spec, phase, started_ms, planned_ms, paused_total_ms } | Paused { …, pause_started_ms }`. Ending is not a state: `advance` or `stop` returns the `SessionRecord` and the engine is `Idle` again.
  - `start(&mut self, id: SessionId, preset: Preset, spec: PresetSpec, now_ms) -> Result<(), TimerError>`; `pause(now_ms)`, `resume(now_ms)`, `stop(now_ms) -> Result<SessionRecord, TimerError>`; `advance(&mut self, now_ms) -> Option<Milestone>`; `view(&self, now_ms) -> EngineView`; `planned_end_ms(&self) -> Option<u64>`.
  - Invariants: `elapsed = clamp(now − started − paused_total − current_pause, 0, planned)`; `remaining = planned − elapsed`; while paused `elapsed` does not move. **Planned end:** `Some(started + planned + paused_total)` while `Running`, `None` while `Paused` (it moves with the pause and is known only on resume). Only a `Running` session ends: `advance(now)` with `now ≥ planned_end` returns `ended(record)` with `ended_ms = planned_end`, not `now`, however late the call (sleep, relaunch). `advance` on a `Paused` session never ends it.
- `Milestone` (core) — `started | paused | resumed | ended(SessionRecord)`; one per transition, never per tick.
- `SessionRecord { id, preset, phase, planned_ms, started_ms, ended_ms, paused_total_ms, focused_ms, end_reason: completed | stopped, extensions: u8 (0 in A) }`.
- `EngineView { state: idle | running | paused, phase, preset: Option<Preset>, session_id: Option<SessionId>, remaining_ms, progress: f64, planned_end_ms: Option<u64> }` — numeric only, so core needs no `LocalTime`; `SessionId(String)` is the UUIDv7 text (core has no `uuid` dependency; the app crate makes the id); `progress` is the elapsed fraction in `[0, 1]` (what `TimerRing` takes). The IPC `TimerView` is built from it in the app crate (see [Interfaces](#interfaces)).
- `format_remaining(ms) -> String` — rounds **up** to the whole second (`ceil`), so `1 ms` and `999 ms` both read `00:01` and the digits reach `00:00` only at the end; `MM:SS`, `H:MM:SS` from 60 minutes up (a countdown is never clipped). `spoken_remaining(ms)` uses the same rounding — "24 minutes 59 seconds", "1 minute", "45 seconds", "1 hour 30 minutes". `format_clock(epoch_ms, utc_offset_min: i32, HourCycle) -> String` — "15:20" or "3:20 PM"; the caller passes the offset for that instant.
- `TimerError` — `already_running | nothing_running | wrong_state | invalid_spec`; `wrong_state` covers pause while paused and resume while running.
- `clock::Hlc { wall_ms, counter: u16, device_id }` — `tick(&mut self, now_ms) -> HlcStamp`; `HlcStamp` renders as `{wall_ms:013}-{counter:05}-{device_id}` (five digits: a `u16` counter reaches 65535), so string order is causal order. Pure; P10's sync protocol reuses it.
- `platform::KeepAwake` trait — `fn begin(&self, reason: &str) -> Result<Box<dyn Any + Send>, PlatformError>`; dropping the box ends the assertion. Core provides `NoopKeepAwake`.
- `platform::LocalTime` trait — `fn utc_offset_min(&self, at_epoch_ms: u64) -> i32; fn hour_cycle(&self) -> HourCycle`. Core provides `UtcLocalTime`.
- `platform::Notifier` trait — `fn status(&self) -> NotificationStatus; fn request(&self, done: Box<dyn FnOnce(NotificationStatus) + Send>); fn post(&self, title: &str, body: &str) -> Result<(), PlatformError>`. Core provides `NoopNotifier` (status `unavailable`, `post` logs nothing and returns `Unsupported`).

### Store: `crates/store` (schema v1, ADR-002 and ADR-012)
```sql
meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)
  -- device_id (a random UUIDv4 the app crate makes and passes to Store::open; written only when absent), hlc_last; the schema version is PRAGMA user_version only
change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT, hlc TEXT NOT NULL, device_id TEXT NOT NULL,
           entity TEXT NOT NULL, entity_id TEXT NOT NULL, field TEXT NOT NULL,
           value TEXT NOT NULL /* JSON */, synced_at INTEGER NULL)
setting(key TEXT PRIMARY KEY, value TEXT NOT NULL /* JSON */, updated_at INTEGER NOT NULL)
  -- syncable; change_log.entity = 'setting', entity_id = key
focus_session(id TEXT PRIMARY KEY /* UUIDv7 */, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
              deleted_at INTEGER NULL, preset TEXT NOT NULL, phase TEXT NOT NULL,
              planned_ms INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
              paused_total_ms INTEGER NOT NULL, focused_ms INTEGER NOT NULL, end_reason TEXT NOT NULL,
              extensions INTEGER NOT NULL DEFAULT 0, intent TEXT NULL)
  -- syncable, append-only: inserted once when the session ends, never updated
active_session(singleton INTEGER PRIMARY KEY CHECK (singleton = 1), snapshot TEXT NOT NULL /* JSON Session */,
               updated_at INTEGER NOT NULL)
  -- device-only: no change_log rows
```
- Settings keys in A: `timer.preset` (a `Preset`), `timer.custom` (a `CustomSpec`, default 45/10), `notify.session_end` (bool, default true).
- `setting` keyed by name and `active_session` as a singleton have no UUIDv7 `id`, `created_at` or `deleted_at`. ADR-002 requires those on every entity; ADR-012 amends it for key-value settings and singleton tables (a setting is deleted by writing its default, never tombstoned; `change_log.entity_id` carries the key, so the sync direction is unchanged).
- The live session is **device-only** (a session runs on one device at a time); finished sessions are **append-only and syncable**. This keeps `focus_session` true to ADR-002's "sessions are append-only" and makes relaunch recovery a one-row read.
- Repositories: `settings` (`get`, `set`), `focus_sessions` (`insert` only; B adds the day queries it needs), `active_session` (`get`, `put`, `clear`). IDs are UUIDv7 made in the app crate (`uuid` with `v7`) from `SystemTime` and carried as `SessionId(String)`; the device id is a UUIDv4 made there too (`v4`) and passed to `Store::open(path, new_device_id)`; every `store.write(now_ms, |txn| …)` takes the current time for the `Hlc` and `updated_at`; core and store never read the clock.

### Where each piece lives (ADR-001, ADR-010)
| Piece | Crate |
|---|---|
| Engine, presets, formatting, `Hlc`, the `KeepAwake`, `LocalTime` and `Notifier` traits with their no-op or UTC defaults; the types `Preset`, `CustomSpec`, `PresetSpec`, `Phase`, `Session`, `EngineView`, `Milestone`, `SessionRecord`, `TimerError`, `HourCycle`, `NotificationStatus` | `crates/core` |
| SQLite, migrations, repositories, change-log writer | `crates/store` (new; depends on core for types; checked for the two mobile targets; not a WebAssembly target) |
| `MacKeepAwake` (`NSProcessInfo.beginActivity`, `userInitiatedAllowingIdleSystemSleep`), `MacLocalTime` (`NSTimeZone`, `NSLocale`), `MacNotifier` (`UNUserNotificationCenter`) | `crates/platform-macos` |
| Scheduler thread, session service, IPC, tray, windows, notifications, UUIDs, every `SystemTime::now()`; the IPC types `TimerView`, `TimerState`, `MilestoneEvent`, `ClockTick`, `StartRequest`, `TimerSettings`, `TimerCommandError`, `SettingsError`, `StoreStatus` (they carry the tauri-specta derives, like `ClockTick` today) | `apps/orasenda/src-tauri` |
| Today, hooks, tests | `apps/orasenda/src` |

## Interfaces

```
crates/core/src/{timer.rs, clock.rs (+Hlc), platform.rs (+KeepAwake)}
crates/store/                              new crate orasenda-store
  Cargo.toml                               rusqlite (bundled), serde, serde_json, orasenda-core
  migrations/0001_init.sql                 embedded with include_str!
  src/{lib.rs, migrate.rs, txn.rs, settings.rs, focus_sessions.rs, active_session.rs}
crates/platform-macos/src/{keep_awake.rs, local_time.rs, notifier.rs}   notifier.rs adds objc2-user-notifications
apps/orasenda/src-tauri/
  Cargo.toml                               tauri feature "tray-icon", uuid (v7), orasenda-store
  src/{session.rs, scheduler.rs, tray.rs, lifecycle.rs, commands.rs (+timer, settings)}
                                           scheduler.rs replaces ticker.rs (one thread emits both clock-tick and timer-tick)
  src/tray/icons/{focus.png, paused.png, idle.png}   one 36×36 px template image each (18 pt at 2x), from the mode shapes
  capabilities/main.json                   + allow-timer-*, allow-settings-*
apps/orasenda/src/
  App.tsx                                  NavRail + page switch; Today is the only live page; the locale and
                                           timeZone props go (time strings now arrive formatted), and
                                           App.test.tsx stops passing them
  pages/{Today.tsx, Placeholder.tsx}       Placeholder renders EmptyState for the other five pages
  useClock.ts                              ClockState.ok gains clock and idleFinish strings
  useTimer.ts                              subscribe() to timer-tick and timer-milestone; onMilestone also gets the pending events
  format.ts, format.test.ts                osLabel and infoLine stay; formatClock stays too, for the spike
                                           only (DevPanel.tsx:4,80 imports it), with a comment saying so;
                                           App.tsx stops calling it (Rust formats the clock)
  spike/DevPanel.tsx                       unchanged: keeps its own locale and timeZone props with system
                                           defaults and keeps formatting usage segments with formatClock
design/system/components/MenuBarTimer/README.md   + "Menu-bar glyphs" note and the exported shapes (design-first)
CONTEXT.md                                 domain terms
```

**IPC types (app crate).** `TimerView { state: idle | running | paused, phase, mode: focus | paused | idle, remainingMs, remaining: string, remainingLabel: string, progress, sessionId: string | null, preset: Preset | null, finish: string | null, store: StoreStatus, notifications: NotificationStatus }` is built by the session service from `EngineView` plus `LocalTime`, the store status and the notifier status: `remaining` and `remainingLabel` come from core's formatters, `finish` is `format_clock(planned_end_ms)` (so `null` while paused or idle), and **`mode` is derived, here and nowhere else**: `idle → idle`, `paused → paused`, `running → focus` (B maps `phase: break` to `break` and the two-minute window to `warning`). `StoreStatus = ok | unavailable | newer`. `TimerState { view, pending: MilestoneEvent[] }`. `MilestoneEvent { kind: started | paused | resumed | ended | recovered, endReason?: completed | stopped, sessionId? }` is the IPC form of a core `Milestone`; `recovered` exists only here (the engine never sees a relaunch).

**Commands** (all `#[tauri::command] #[specta::specta]`, camelCase, `u64` exported as `Number`; errors serialized `{ kind, message }`):
- `timer_state() -> TimerState` — never errors; `idle` before the store has opened. `pending` holds milestone events that happened before any webview was listening (`recovered` at launch) and is drained by the call, so a milestone is never lost to the race between `listen` resolving and the first command. Once `timer_state` has drained it, a later `recovered` event (a retried read, an idle flush) is emitted as a `timer-milestone` instead; when a transition records the unread row, its event is dropped, because that transition dismisses one-shot notices anyway.
- `timer_start(request: StartRequest { preset: Preset, custom: Option<CustomSpec> }) -> Result<TimerView, TimerCommandError>` — makes the UUIDv7, starts the engine with the preset and its spec, begins the `KeepAwake` activity and puts `active_session` under the session lock, then, after unlocking, emits `timer-tick` and `timer-milestone started`, then, if the notification status is `notDetermined`, calls `Notifier::request` without waiting. "Just 2 minutes" sends `{ preset: "quick", custom: null }`. A store failure does not fail the start: the view comes back with `store: "unavailable"`.
- `timer_pause()`, `timer_resume()`, `timer_stop() -> Result<TimerView, TimerCommandError>` — `stop` records `end_reason: stopped`.
- `settings_get() -> TimerSettings { preset, custom, notifySessionEnd }` — defaults when the store is degraded. `preset` is never `quick`.
- `settings_set(settings: TimerSettings) -> Result<(), SettingsError>` — validates (`quick` and an out-of-range `custom` are `invalidSpec`), writes, then publishes one `clock-tick` at once so the idle finish preview follows the new preset without waiting for the next second.
- `TimerCommandError.kind` — `alreadyRunning | nothingRunning | wrongState | invalidSpec | store`. `SettingsError.kind` — `invalidSpec | unavailable | write`.
- A `sessions_today` query is deferred to B, which has the first consumer (the deep-hours cap); A shows no totals.

**Events:**
- `clock-tick` with `ClockTick { epochMs, clock: string, idleFinish: string | null }` — once a second, always (as the shell's ticker does today), plus on `WindowEvent::Focused(true)` (`apps/orasenda/src-tauri/src/lib.rs:83-87`) and after `settings_set`. `clock` is the formatted wall clock; `idleFinish` is the finish time the chosen preset would have if started now, `null` while a session runs or is paused. This is what feeds Today while idle; the engine is not involved.
- `timer-tick` with `TimerView` — once a second while `running` or `paused`, plus once on every transition and on `Focused(true)`. Rendering is a pure function of the latest view. Nothing is emitted on this event while idle, with one exception: whenever the notification status changes (the launch read, a request answer, the re-read at a completed end), one `timer-tick` is emitted in every state, so the explanation line under the Start button follows the status at once.
- `timer-milestone` with `MilestoneEvent` — one-shot effects only: the "Session ended." and recovery notices. The store status is state, not a milestone: it travels in every `TimerView` and the standing line on Today follows it.

**Scheduler (`scheduler.rs`).** One thread, `session-scheduler`, replaces the shell's `clock-ticker` (`apps/orasenda/src-tauri/src/ticker.rs:15-25`): sleep `delay_to_next_second(SystemTime::now())` (`crates/core/src/clock.rs:11`), then `now = epoch_ms(SystemTime::now())`, lock the session service, `advance(now)`; if it returned `ended(record)`, write that end (insert `focus_session` and clear `active_session`, together with any owed flush, in one transaction); otherwise, if anything is unsaved (see **Unsaved writes** below), retry the flush once (so at most once a second); then take the view (so its `store` status reflects that write) and any milestone, and unlock. Only then emit `clock-tick` (formatted with `LocalTime`) and publish the engine's result in one of three ways: when the engine was running or paused before and still is, emit `timer-tick` and set the tray title and icon; when `advance` returned `ended(record)`, the view is now idle and is still published once (`timer-tick` with `state: idle`), the tray is reset to its idle glyph with no title, and the rest of the milestone is handled outside the lock (notify, drop the `KeepAwake` guard taken out under the lock, emit `timer-milestone ended`); when the engine was idle before and after, nothing beyond `clock-tick`. No emit, tray call or `Notifier` call happens while the lock is held (conventions: never hold a lock across an AppKit call). Idle costs one `clock-tick` a second, which the shell already pays today; no database read happens per tick because the service caches the settings.

**Unsaved writes (`session.rs`).** Every transition writes the store in one transaction: on start, pause and resume it puts the live `Session` snapshot into `active_session`; on an end it inserts `focus_session` and clears `active_session`. When a transaction fails, the service records what is still owed, as two things: an in-memory `unsaved: Vec<SessionRecord>` of finished sessions, and a flag `snapshot_dirty` meaning "the `active_session` row does not match the engine". There is no stored "pending clear": the flush always writes **the current snapshot** (put the live session if the engine is running or paused, clear the row if it is idle), so a stale clear can never remove a session that started after the failure. The engine itself is never blocked: it goes on, the tray follows it and the notice shows. Every later write attempt (a transition, or the scheduler's once-a-second retry while `unsaved` is non-empty or `snapshot_dirty` is set) first inserts `unsaved` and writes the current snapshot in the same transaction, then does its own work; on success both are cleared. **Every store write runs under the `SessionService` lock, in the same hold as the engine change it reflects**: a transition changes the engine, writes its transaction (flush first) and updates `unsaved` and `snapshot_dirty` before unlocking. The scheduler's retry reads the engine snapshot, writes it and clears `unsaved` and `snapshot_dirty` without releasing the lock in between. So no command can change the engine between the read and the write and leave a stale snapshot on disk with the dirty flag cleared (test `retry_flush_holds_lock_against_concurrent_start`). Emits, tray updates and `Notifier` calls happen after unlock. `KeepAwake` begins and its guard is taken out of the service in the same lock hold as the engine change; the guard is dropped after unlock (`NSProcessInfo` is Foundation, not AppKit). `RunEvent::Exit` makes a last flush attempt. If the store never recovers before the process ends, the last snapshot that did reach disk wins on relaunch; that case is a known limit of a store that cannot write at all, and the degraded line on Today has been telling the user so the whole time. Commands run the same "advance, then publish" step synchronously so the UI never waits for the next second.

**Menu bar (`tray.rs`).** `TrayIconBuilder` with a template icon per mode (circle for focus, pause bars for paused, hollow circle for idle; B adds the triangle and the half circle) and `set_title` with `remaining` while running or paused, empty when idle. Left click opens the native menu: *Pause* or *Resume*, *End session* (both absent when idle), *Show Orasenda*, *Quit Orasenda*. Menu items call the session service directly; no IPC. The design system's `MenuBarTimer` cannot render inside `NSStatusItem`, so the native item mirrors its compact form (digits plus a mode shape); the React component is used by C's floating window.

**Windows (`lifecycle.rs`).** `CloseRequested` on `main` is prevented and the window hides. `RunEvent::Reopen` (Dock click) and *Show Orasenda* show and focus it. ⌘Q and *Quit Orasenda* quit without confirmation; the live session is already persisted. The activation policy stays `Regular`.

**Notification (`Notifier`).** At `ended` with `end_reason: completed`, `notify.session_end` true and status `granted`: `post("Focus session complete.", "Time for a break.")`. No notification for `stopped`. `MacNotifier` wraps `UNUserNotificationCenter.currentNotificationCenter`: `status` reads `getNotificationSettingsWithCompletionHandler` (blocking on a channel, off the main thread), `request` calls `requestAuthorizationWithOptions:(alert | sound)` and reports the answer through the callback, `post` adds a `UNNotificationRequest` with a fresh identifier and no trigger. `UNUserNotificationCenter` aborts outside an app bundle, so the app crate picks `MacNotifier` only when `NSBundle.mainBundle.bundleURL` has the `app` path extension and otherwise `NoopNotifier` (status `unavailable`); a bundle identifier is not enough, because tauri-codegen embeds an `Info.plist` in dev binaries too. An unbundled `tauri dev` run shows the end only on Today, and the acceptance uses the bundled debug app. No delegate is installed, so a notification is shown only while Orasenda is not the frontmost app; when it is, the Today notice is enough. The notification status is read at launch (off the main thread), after each `request` and again, off-lock, right before posting at a completed end (so a permission granted later in System Settings is honoured without a relaunch); it travels in `TimerView.notifications`, and each change publishes one `timer-tick`.

**Relaunch recovery (`session.rs`, in `setup()`).** Read `active_session`. A `Running` snapshot whose planned end has passed: insert `focus_session` as `completed` at the planned end, clear the row, and put a `recovered` milestone event in `pending`, which the first `timer_state` call returns (an event emitted before a listener exists would be lost). A `Running` snapshot still in time, or **any `Paused` snapshot** (its planned end is unknown until it resumes): restore it exactly as stored and begin the `KeepAwake` activity. A store that fails to open at launch leaves the engine `Idle` with `store: unavailable` in the view.

**Today (`pages/Today.tsx`).** `h1` "Today". `TimerRing size={280}` with `remaining`, `remainingLabel`, `progress` and `mode` from the view and `clock` from the latest `clock-tick`. A `ModeChip` with the state word ("Focus", "Paused", "No session"). The preset choice is a native radio group using the design system's `.os-choice-group` and `.os-choice` classes (44 px targets), with two `Input`s for Custom minutes shown only when Custom is checked; changes call `settings_set`. `StartButton` with `onStart`, `onQuickStart` (sends `preset: "quick"`; B adds the keep-going prompt) and `finishTime` from `clock-tick.idleFinish`. While running or paused the StartButton is replaced by `Button variant="quiet"` *Pause* or *Resume* and `Button variant="ghost"` *End session*, so the screen keeps one primary; the ring's `clock` comes from `clock-tick.clock`. The running `TimerView.finish` renders beside the `ModeChip`, in `body-sm` `ink-muted`, as "Realistic finish · 15:20" (StartButton's exact words for its idle `finishTime`, `Realistic finish · ` followed by the time in `os-num`, so the finish time keeps one wording on the screen); while paused `finish` is `null` and the line is not rendered at all, because the `ModeChip` already says "Paused" and the screen must not say it twice. Under the Start button, while `view.notifications === "notDetermined"`, one `body-sm` `ink-muted` line reads "Orasenda can tell you when a session ends, even when its window is hidden." An `InlineNotice` slot under the ring shows at most one notice, by priority: a one-shot notice from the latest milestone event ("Session ended." for `ended`, "Your last session ended while Orasenda was closed." for `recovered`), with no action (the Start button is back and is the one way to start again; a second Start would break the StartButton rule), dismissed by the next transition; otherwise the standing store line while `view.store !== "ok"` ("Orasenda can't save sessions right now." or "This data was saved by a newer Orasenda."), which stays as long as the state does. **The `InlineNotice` is the only announcer**: it is `role="status"` by design (its README), so mounting it at the milestone is the announcement, and the spec adds no hidden live region. `started`, `paused` and `resumed` are not announced: they are the result of the button the user just pressed, whose label changes under focus, and the ring is `aria-live="off"` by design.

**App shell (`App.tsx`).** `NavRail` with `current` from local state; Today renders `Today`; the other five pages render `Placeholder` with `EmptyState` title "Nothing here yet." and message "This comes in a later phase." The spike `DevPanel`, rendered at the end of `<main>` today (`apps/orasenda/src/App.tsx:56`), moves under Today's content and is unchanged otherwise.

## Behavior & edge cases
- **Start while running or paused** → `alreadyRunning`; pause or end while idle → `nothingRunning`; pause while paused or resume while running → `wrongState`. No state changes on an error. Every command is safe to repeat from any window (ADR-013).
- **Custom out of range** → `invalidSpec` from both `settings_set` and `timer_start`; the `Input` helper says "Between 5 and 180 minutes." No alert styling. `quick` ignores the Custom range and is refused by `settings_set`.
- **Pause** records `pause_started_ms`; **Resume** adds the pause to `paused_total_ms` and moves the planned end. `TimerView.mode` becomes `paused`: the ring freezes, the chip reads "Paused", the finish line beside the chip disappears (it returns as "Realistic finish · …" with the moved end on Resume), the menu bar shows the bars with the frozen digits.
- **End session** records `end_reason: stopped` and the actual `focused_ms`; it counts toward the day's focused time once B shows it ([Open questions](#open-questions), 3). Copy: "Session ended.", never "abandoned" or "gave up".
- **Natural end**: `advance` returns `ended(record)`; the app crate inserts `focus_session`, clears `active_session` (one transaction), drops the `KeepAwake` guard, posts the notification, emits the view (`idle`) and the milestone event. The tray returns to its idle glyph with no title; the menu bar carries no "ended" cue of its own (one would be a new glyph or title text, so it is a design-system question left for B's warning work), and the end is shown by the notification and on Today.
- **Sleep and wake:** the first scheduler wake after sleep finds `now ≥ planned_end` on a `Running` session and ends it at `planned_end`; the notification fires then, once. If the planned end has not passed, the view simply shows the true remaining time. A `Paused` session sleeps through unchanged.
- **Clock set forward** → same path as wake. **Clock set back** → remaining grows by the jump; accepted and documented (FAQ). The engine clamps `elapsed` to `[0, planned]` and never panics.
- **Quit mid-session** → no dialog; `active_session` is written on every transition, never per tick. **Relaunch** → recovery as in [Interfaces](#interfaces). A paused session comes back paused with the same remaining, however long the app was closed; only a running one can have ended meanwhile.
- **End with a failing write** → the record stays in `unsaved` and `snapshot_dirty` is set; the engine is idle. The notice slot shows the one-shot "Session ended." first (it has priority); the standing store line takes the slot at the next transition, or at once if the user starts another session. When the standing line mounts after a one-shot notice it **is announced again** (a fresh `InlineNotice` mount is a fresh `role="status"` node; the UI test `standing_store_line_after_one_shot_notice_is_announced_once` asserts exactly one such node at each step). The next successful write (the scheduler retry or the next transition) inserts the record as `stopped` or `completed` exactly as recorded and writes the current snapshot, so the session does not come back on relaunch and is never counted with more minutes than it had.
- **Start with a failing `active_session` put** → the session runs (the engine does not wait for disk), `snapshot_dirty` is set and the standing line shows; when the store recovers, the retry puts the **current** live snapshot, so a session started after an earlier failure survives a relaunch (test `failed_put_then_recover_keeps_live_snapshot`).
- **Close window** → hides; the process stays in the menu bar. **Dock click** or *Show Orasenda* → shows. Nothing is lost by closing.
- **Store cannot open** (corrupt file, permission denied) → the app runs with the engine in memory; `view.store = "unavailable"`; Today mounts the standing line once (that mount is the announcement) and keeps it while the state lasts; `settings_set` returns `unavailable`. Never a modal, never `critical`.
- **`user_version` newer than this build** → the file is left untouched, `view.store = "newer"`, the standing line reads "This data was saved by a newer Orasenda.", and nothing is written until the app is updated.
- **Store write fails mid-flight** (disk full) → logged with `eprintln!`, the session continues, `view.store` becomes `unavailable` and the standing line mounts; the next successful write returns it to `ok` and the line unmounts. A second failure later mounts it again, which is the "once per entry" rule.
- **Store read fails at launch** (busy, I/O) → settings fall back to defaults, the engine stays `Idle`, `view.store` is `unavailable` and the unread `active_session` row is owed: the scheduler retries the read every second until it succeeds (recovery then runs and the status returns to `ok`), and a write that arrives first re-reads the row inside its transaction and records any session it finds as ended before replacing it.
- **Notification status `denied` or `unavailable`** → the end still shows on Today; no line about notifications and no second prompt. `settings.notifySessionEnd` is still honoured when the status later becomes `granted` through System Settings.
- **The notification request is answered**, while the session is running or after it ended → one `timer-tick` carries the new status; nothing changes on Today except the explanation line going away; the end notification follows the answer.
- **Emit fails** (no window listening) → logged, the loop continues, like the shell ticker.
- **Reduce motion** → the ring and chip changes are immediate (design system); nothing added.
- **StrictMode double mount** → hooks use the shell's `subscribe()` (`apps/orasenda/src/subscribe.ts:16-47`), so one listener remains.
- **Empty states**: idle Today shows the ring in `idle` mode ("No session") and the finish time for the chosen preset.

## Data & migrations
- New database `orasenda.db` (WAL; `-wal` and `-shm` beside it) under `app_data_dir()`: `~/Library/Application Support/com.veloud.orasenda/` on macOS.
- `crates/store/migrations/0001_init.sql` creates the five tables above. The runner is generic from day one: numbered files embedded with `include_str!`, each applied in its own transaction, `PRAGMA user_version` set at the end, forward-only. **`PRAGMA user_version` is the only schema version**; `meta` does not repeat it. A database with a newer `user_version` is refused (degraded mode above). B–E each add `000N_*.sql`.
- No backfill: there is no existing data. No compatibility concern: the shell wrote nothing to disk ([shell spec](2026-11-07-app-shell.md), "Data & migrations").
- `focus_session` carries `extensions` and `intent` now so B needs no migration for them; everything else B needs is added by B's own migration.

## Testing strategy
**Rust — `crates/core`** (`cargo test`): engine arithmetic with fixed `now_ms` (start, pause, resume, stop; `elapsed` frozen while paused; `planned_end_ms` is `Some` while running, `None` while paused, and moves by the pause after resume); a late `advance` on a running session ends at `planned_end`, not `now`; `advance` on a paused session never ends it, however late; the record carries the preset given to `start` (`quick`, `classic`, `custom`); `elapsed` clamped on a backward clock, never negative, `progress` in `[0, 1]`; one milestone per transition and none per tick; `wrong_state` for pause while paused and resume while running; `format_remaining` for 0, 1 ms and 999 ms (both `00:01`), 59 s, 60 s (`01:00`), 25 min, 90 min; `spoken_remaining` singular and plural; `format_clock` for both hour cycles and a negative UTC offset; preset specs; `CustomSpec` bounds; `Hlc` strictly increasing across equal and backward wall times and sortable as strings; serde shapes (`Preset` snake_case, `TimerError` camelCase; the `{kind, message}` shape is the app crate's `TimerCommandError`).

**Rust — `crates/store`** (real SQLite in a temp dir, `cargo test`): a fresh file reaches `user_version = 1` with `meta` holding `device_id` and `hlc_last` and `journal_mode = wal`; reopen is idempotent; a newer `user_version` is refused; `settings.set` writes exactly one `change_log` row per changed field, with increasing `hlc` and the device id; `focus_sessions.insert` writes one row per field; `active_session` put, get and clear; a dropped connection without commit leaves the previous state (crash simulation); `open_in_memory(new_device_id)` for the app crate's tests.

**Rust — `crates/platform-macos`** (macOS only): `keep_awake_begins_and_ends` (no permission, no prompt); `local_time_offset_matches_ns_time_zone` and `hour_cycle_is_h12_or_h23`; `is_app_bundle_is_false_under_cargo_test` (the test binary has no bundle); the app crate's `choose_notifier_outside_bundle_is_noop` then checks that the selection picks the no-op. Requesting and posting are manual (acceptance steps 2 and 7).

**Rust — app crate**: `SessionService` with an injected `now_ms`, `Store::open_in_memory(new_device_id)` and fake `Notifier`, `LocalTime` and `KeepAwake`: every transition, milestone-event order, `quick` start with `QUICK_START_MS`, `TimerView` built from `EngineView` (`mode` derivation, `finish` null while paused, formatted while running), recovery of a running snapshot in both branches with `recovered` in `pending` and drained by `timer_state`, **`recovers_paused_session_as_paused`** (a paused snapshot whose start is hours old comes back paused with the same remaining and no record), **`stop_with_failing_write_does_not_resurrect_on_relaunch`** (stop while the store rejects writes, then the store recovers and one tick flushes: exactly one `stopped` row with the recorded `focused_ms`, `active_session` empty, and a new service opened on the same store starts idle), **`failed_put_then_recover_keeps_live_snapshot`** (stop A with the store failing, start B with the put failing too, the store recovers, one tick flushes: A is one row, `active_session` holds B, and a new service opened on the same store resumes B), **`retry_flush_holds_lock_against_concurrent_start`** (`snapshot_dirty` set with the engine idle, the store recovered, and a test-only `Store` write gate that blocks the flush's write on a channel, next to the existing "store rejects writes" injection: start the scheduler flush on one thread and wait until it is inside the write; while the write is parked, assert that `SessionService`'s lock is held (`try_lock` fails) and that a `timer_start` on a second thread has not changed the engine or returned; the gate parks before the store takes its connection, so the only thing that can hold `timer_start` back is the session lock; release the write and join both threads; then `active_session` holds the started session, `snapshot_dirty` is false, and a new service opened on the same store resumes that session), the ending tick publishes an idle view once and resets the tray, `store` status across a failing write and the next success, `idleFinish` null while running and formatted while idle, `settings_set` refusing `quick` and out-of-range Custom, the request made only when `notDetermined`, the tray title and icon chosen per view; the existing `manifest_commands_match_specta_builder` and capability tests cover the new commands; `export_bindings` includes `timerTick`, `timerMilestone` and the extended `clockTick`.

**UI — Vitest + `mockIPC`**: *Start focus* calls `timer_start` with the checked preset and *Just 2 minutes* with `quick`; a `clock-tick` renders the wall clock and the idle finish time; a `timer-tick` renders the digits, the chip word and the planned finish; `paused` renders "Paused"; the `ended` milestone event shows "Session ended." and **exactly one `role="status"` node in the document carries that text** (the `InlineNotice`); the same assertion for `recovered` returned in `timer_state().pending`; `store: "unavailable"` on mount renders the standing line as the single `role="status"` node, and a later `ok` view removes it; `standing_store_line_after_one_shot_notice_is_announced_once` (an `ended` event with `store: "unavailable"` shows only "Session ended.", the next transition replaces it with the standing line, and at each step exactly one `role="status"` node exists); the running finish line renders "Realistic finish · …" beside the chip, and while paused no finish line is rendered and `getAllByText("Paused", { exact: true })` returns exactly one node (the `ModeChip`); the explanation line shows only while `notDetermined`; Custom shows the two inputs and an `invalidSpec` reply shows the helper; the rail switches pages and the other pages render `EmptyState`; one listener remains under StrictMode.

**`ci.sh`**: the core boundary check also rejects `rusqlite`; a new step fails when `grep -rn 'cfg(target_os' crates/core/src` matches anything; the mobile `cargo check` adds `-p orasenda-store`; `clippy` and `cargo test` cover the new crate.

**End-to-end**: none automated (no WebDriver for WKWebView, as the shell spec records).

**Manual macOS acceptance** (recorded in the PR, in the bundled debug app):
1. Classic session: ring, chip and menu-bar title agree; Pause and Resume from Today and from the menu-bar menu; End session records a `stopped` row (checked with `sqlite3`).
2. Start, ⌘H for 25 minutes: the menu bar counts the whole time; the end notification arrives within 1 s of the planned end; Activity Monitor's App Nap column reads "No" during the session.
3. Start, close the window, reopen from the Dock: the ring shows the true remaining time.
4. Start a 5-minute Custom session, `pmset sleepnow` for 7 minutes: one notification after wake; the row's `ended_at` equals the planned end.
5. Start, ⌘Q at 12:00 remaining, relaunch: the ring resumes near 10:00. Then quit again, wait past the planned end, relaunch: one "ended while Orasenda was closed" notice and a `completed` row.
6. Set the clock forward 10 minutes mid-session (the session ends); set it back (the remaining grows; nothing crashes).
7. Deny the notification permission in a fresh install: at the end, Today shows "Session ended." and the menu bar returns to its idle glyph; no second prompt.
8. Light and dark; the 24-hour setting on and off (the finish time follows); VoiceOver reads the ring name, chip, buttons and menu-bar items; a keyboard-only run from launch to a completed session.
9. CPU: `top` over 5 minutes with a session running and the window hidden, below 0.5 % average.

### Dependencies to vet (`baton:deps`, versions read from the registries at plan time)
| Ecosystem | Package | Note |
|---|---|---|
| cargo | rusqlite (`bundled`) | must `cargo check` for `aarch64-apple-ios` and `aarch64-linux-android` |
| cargo | uuid (`v7`, `v4`, `serde`) | app crate only: `v7` for session ids, `v4` for the device id |
| cargo | tauri feature `tray-icon` | same 2.12.x pin |
| cargo | objc2-user-notifications 0.3.2 | `UNUserNotificationCenter`; already in `Cargo.lock` through Tauri, so no second copy |
| cargo | objc2-foundation features for `NSProcessInfo`, `NSTimeZone`, `NSLocale`, `NSBundle` | already in the tree at the Tauri-matched version |

`tauri-plugin-notification` was considered and rejected (see [FAQ](#why-not-tauri-plugin-notification)).

## Decisions
- [ADR-011: Time and scheduling](../DECISIONS.md#adr-011-time-and-scheduling) — proposed by this spec; accepted by its last task.
- [ADR-012: Store crate API](../DECISIONS.md#adr-012-store-crate-api) — proposed by this spec; accepted by its last task. It amends ADR-002 for key-value settings and singleton tables (no UUIDv7 id, `created_at` or `deleted_at`).
- [ADR-013: One Rust state, many surfaces](../DECISIONS.md#adr-013-one-rust-state-many-surfaces) — proposed by this spec; accepted by its last task.
- Relies on ADR-001, ADR-002, ADR-007, ADR-010.
- [CONTEXT.md](../../CONTEXT.md) is created with: session, preset, phase, milestone, planned end, device-only, syncable, change log, engine, scheduler, surface, degraded.
- **Design system (design-first):** the `MenuBarTimer` README gains a "Menu-bar glyphs" note with the three (later five) template shapes; the first UI task updates the artifact, then refreshes `design/system/`.
- `docs/conventions.md` gains: time strings are formatted in Rust; `crates/store` is the only crate with SQLite; device-only tables never write `change_log`.

## FAQ
### Why a vertical slice rather than the store first?
P1 is "usable daily as a focus timer"; dogfooding starts after this spec. The risks that could change the plan (timer truth while hidden or asleep, the menu-bar and hide-on-close lifecycle) only show up end to end. ADR-002 already fixes the store's shape, so one real entity is enough to settle its API without inventing repositories nobody calls.

### Why is the wall clock the only time base?
A focus session is real time: "time is always visible" means true time. Deriving the remaining time from `started_ms` and `now` means no tick can drift it, and sleep, App Nap or a throttled webview change nothing. A monotonic clock would stop during sleep on macOS and would not survive a relaunch. The cost is a backward clock change, which is rare and only makes the remaining time grow.

### Why does Rust format the digits?
The menu-bar title needs the string in Rust anyway, WKWebView ignores the macOS 24-hour setting, and one formatter means every surface shows the same digits. React renders; it does not compute time (ADR-001, ADR-011).

### Why a native menu-bar item rather than the `MenuBarTimer` component?
`NSStatusItem` holds an image and a title, not a webview. The native item mirrors the component's compact form; the component itself is used for the floating window in C.

### Why is the live session device-only and the history append-only?
A session runs on one device, so its live state has nothing to merge, and keeping it out of `change_log` avoids one log row per pause. Finished sessions are facts, so they are inserted once and synced as rows (ADR-002).

### Why keep the App Nap assertion if the wall clock already keeps the count true?
The count is true, but the moment the end fires could be delayed by timer coalescing, and the menu bar should tick every second while the window is hidden. The assertion costs nothing and allows idle sleep.

### Why not tauri-plugin-notification?
Read from the 2.8.0 crate source: its desktop implementation never asks for permission (`request_permission` and `permission_state` return `Granted`, `src/desktop.rs:193-206`), posts on macOS through `notify-rust` and `mac-notification-sys`, which use the deprecated `NSUserNotification` API, and under `tauri dev` sets the sending application to `com.apple.Terminal` (`desktop.rs:518-524`). Orasenda asks at the moment of need and must be honest about the answer, so it talks to `UNUserNotificationCenter` through a core trait and a `platform-macos` implementation, the same layout as every other OS call (ADR-010).

### Why does the clock ticker keep running while idle?
It already does in the shell, at a cost the spike measured as negligible, and it is what shows the wall clock and the finish preview on Today without any time arithmetic in the webview. Merging it with the session scheduler leaves one thread and one publish step; `timer-tick` itself is silent while idle.

### Why is "Just 2 minutes" a preset?
It needs a name in `focus_session.preset` so B's keep-going prompt and E's export can tell it apart, and `preset` is a TEXT column, so a new value costs no migration. It is never a selectable default: it exists to be pressed.

### Why no confirmation on quit during a session?
The session is persisted on every transition and resumes on relaunch; a dialog would protect nothing. The full-screen exit confirmation in C guards an accidental key press, which is a different case.

## Open questions
All three were the owner's call and are now decided, as recommended. None is open.

1. **Dock icon or menu-bar-only app?** (decided by the owner, 2026-11-08, as recommended) Keep the Dock icon (`Regular` activation policy) in P1: the window hides on close and the menu bar carries the timer. A "hide Dock icon" setting is a cheap later addition and keeps ⌘Tab working for beta testers.
2. **A session that ends while the Mac is asleep or Orasenda is closed: is it completed?** (decided by the owner, 2026-11-08, as recommended) Yes, completed at its planned end and counted like any other, with one calm notice. It is the wall-clock truth, and stats stay neutral.
3. **Does a session ended early count its minutes?** (decided by the owner, 2026-11-08, as recommended) Yes: record `focused_ms` with `end_reason: stopped` and count it toward the day's focused time and the deep hours when B shows them. Nothing a person did is lost, and the copy never judges.

## Implementation status
- [x] Plan: `docs/plans/2026-11-08-focus-session-loop.md`
- [x] Issues: #85–#94
- [x] ADR-011, ADR-012, ADR-013 accepted
- [x] Owner's manual acceptance (#110, 2026-11-09)
