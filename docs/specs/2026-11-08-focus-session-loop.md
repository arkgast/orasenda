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

```
│ Today                                                      │
│                                                            │
│                 ╭────────────╮        ● Focus              │
│                 │   24:59    │                             │
│                 ╰────────────╯                             │
│                                                            │
│   ( ) Classic 25/5   (•) 50/10   ( ) Deep Block 90   ( ) Custom
│                                                            │
│              [ Start focus ]   Just 2 minutes              │
│              Finish around 15:20                           │
```

Menu bar, at the same moment: `● 24:59`. Close the window: the process stays, the menu bar keeps counting. Pause from the ring's quiet button or the menu-bar menu: the arc freezes, the chip says "Paused", the menu bar shows the pause bars. At `00:00` one macOS notification says "Focus session complete." and Today shows a quiet line with *Start another*. Quit Orasenda at `12:00` and relaunch two minutes later: the ring shows `10:00` and keeps going.

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
The shell keeps time in Rust and renders it in React (`apps/orasenda/src-tauri/src/ticker.rs:15-28`, `apps/orasenda/src/App.tsx:36-57`), but it has no product behaviour: the only command is `app_info`, the rest are spike commands (`apps/orasenda/src-tauri/src/lib.rs:25-39`), closing the window quits the app (no `CloseRequested` handler in `lib.rs`; recorded in the [shell spec](2026-11-07-app-shell.md) line 123 and its FAQ), the menu bar is empty (`tauri` has no `tray-icon` feature: `apps/orasenda/src-tauri/Cargo.toml:22`, pin at `Cargo.toml:16`) and nothing is stored (no `rusqlite` or `uuid` in any `Cargo.toml`). People with ADHD need the time visible at all times and starting to cost almost nothing (SPEC §1.7). The first daily-usable build is a focus timer that survives a hidden window, sleep and a relaunch, and the storage it writes must already have the shape sync will need (ADR-002), because retrofitting that is expensive.

## Goals / Success criteria
1. On Today, choosing a preset and pressing *Start focus* starts a session whose ring, chip and menu-bar title agree to the second; Pause, Resume and End work from the Today buttons and from the menu-bar menu.
2. With the window hidden (⌘H), minimized or closed, the menu-bar title keeps counting and the session ends on time: after 25 minutes hidden, the end is within 1 s of the planned end.
3. After `pmset sleepnow` across the planned end, the session is recorded as completed at its planned end and exactly one notification arrives after wake.
4. Quitting mid-session and relaunching resumes the session with the true remaining time; relaunching after the planned end records the session as completed at the planned end and shows one notice.
5. Every completed or ended session is one `focus_session` row plus one `change_log` row per field, written in one transaction; the live session is one device-only `active_session` row that is empty when idle.
6. `crates/core` stays free of `tauri`, `tao`, `wry`, `objc2`, `rusqlite` and `cfg(target_os)`; `crates/core` and `crates/store` both `cargo check` for `aarch64-apple-ios` and `aarch64-linux-android`; `./scripts/ci.sh` enforces both.
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
- Design-system component changes. The menu-bar glyphs are new assets, not new components.

## Users & permissions
One local user, no accounts. Least privilege for the webview.

| Caller | Can | Cannot |
|---|---|---|
| Webview `main` | `app_info`; `timer_state`, `timer_start`, `timer_pause`, `timer_resume`, `timer_stop`; `settings_get`, `settings_set`; `sessions_today`; listen to and unlisten from events | file system, shell, http, posting notifications (Rust does, through `Notifier`), any spike command in a release build |
| Orasenda process | read and write under `app_data_dir()`; show a menu-bar item; post a user notification once the user has allowed it; hold an App Nap activity while a session runs | network; paths outside `app_data_dir()`; any TCC permission other than Notifications |

- Each new command goes into `AppManifest::commands` in `build.rs` and `capabilities/main.json` (today it grants `allow-app-info` plus listen, unlisten and the spike commands: `apps/orasenda/src-tauri/capabilities/main.json:6-15`).
- **Notification permission** is requested when the user starts the first session (SPEC §2.7: permissions at the moment of need). While the authorization is `notDetermined`, Today shows one line under the Start button: "Orasenda can tell you when a session ends, even when its window is hidden." `timer_start` starts the session first and then asks the system; the start never waits for the answer. The line disappears as soon as the authorization is anything but `notDetermined`. If denied, the end is shown in the app and in the menu bar, and the app never asks again; macOS System Settings is the way back. "Already asked" is not stored by Orasenda: the system's own authorization status is read at launch and after each request.
- **Not `tauri-plugin-notification`.** Its desktop side reports `Granted` without ever asking (2.8.0 `src/desktop.rs:193-206`), posts through `notify-rust` and `mac-notification-sys` (the deprecated `NSUserNotification` API), and impersonates `com.apple.Terminal` under `tauri dev` (`desktop.rs:518-524`). Orasenda uses a `Notifier` trait in core, implemented in `crates/platform-macos` on `UNUserNotificationCenter` (`objc2-user-notifications`, already in `Cargo.lock` at the Tauri-matched 0.3.2). No JS notification permission exists.

## Tenancy & localization
- Single user, single device.
- **Rust produces every time string** (ADR-011): the countdown `"24:59"`, the spoken label `"24 minutes 59 seconds"`, the menu-bar title and the finish time `"15:20"`. The webview never computes time.
- The finish time and the wall clock use a **UTC offset and an hour cycle passed in from the app crate** through a core `LocalTime` trait: `utc_offset_min(at_epoch_ms)` and `hour_cycle()` (`H12` or `H23`). `crates/platform-macos` implements it with `NSTimeZone.localTimeZone.secondsFromGMTForDate` and the locale's hour cycle (`NSLocale` formatted template plus the `AppleICUForce24HourTime` default), which fixes the known WKWebView limitation that ignores the 24-hour setting (`docs/spikes/2026-11-07-macos-blocking.md:118`, shell spec line 66). The offset is taken **at the instant being formatted**, so a finish time across a DST change is right. Other targets use core's `UtcLocalTime` (offset 0, `H23`) until they get a platform crate; Windows is advisory and mobile has no features, so this is acceptable and noted here. No `time` or `chrono` dependency.
- The shell's `clock-tick` now carries the formatted wall clock (`clock: String`) and, while idle, the finish preview for the chosen preset; `timer-tick` carries the planned finish while a session runs.
- Timestamps are UTC epoch milliseconds, so a DST change never alters a remaining time. "Today" for `sessions_today` is the local calendar day, whose start the webview computes with `Intl` and passes as `day_start_ms` (this is a date, not a time string, so the hour-cycle issue does not apply).
- Copy is English only.

## Domain model
Terms are defined in [CONTEXT.md](../../CONTEXT.md).

### Core: `crates/core::timer` (pure; `now_ms` passed in; no `SystemTime::now()`)
- `Preset` — `classic | fifty_ten | deep_block | custom | quick`, serialized snake_case. `CustomSpec { focus_min: u16, break_min: u16 }`, valid when `5 ≤ focus_min ≤ 180` and `1 ≤ break_min ≤ 60`. `PresetSpec { focus_ms, short_break_ms, long_break_ms, rounds_before_long: u8 }`; `Preset::spec(&self, custom: &CustomSpec) -> Result<PresetSpec, TimerError>`: Classic 25/5/15 after 4, 50/10/20 after 4, Deep Block 90/15/30 after 2, `quick` a fixed 2-minute focus (`QUICK_START_MS`) with Classic's breaks. `quick` is what "Just 2 minutes" starts; it is never the selected preset in settings, it is stored as `focus_session.preset = 'quick'` (a TEXT column, so B's keep-going prompt and E's export need no migration), and it is exempt from the Custom minimum. The break fields exist now so B adds no new type; A never starts a break.
- `Phase` — `focus` only in A. Serialized lowercase. B adds `break`.
- `Session` (the engine) — `Idle | Running { id, spec, phase, started_ms, planned_ms, paused_total_ms } | Paused { …, pause_started_ms }`. Ending is not a state: `advance` or `stop` returns the `SessionRecord` and the engine is `Idle` again.
  - `start(&mut self, id: Uuid, spec: PresetSpec, now_ms) -> Result<(), TimerError>`; `pause(now_ms)`, `resume(now_ms)`, `stop(now_ms) -> Result<SessionRecord, TimerError>`; `advance(&mut self, now_ms) -> Option<Milestone>`; `view(&self, now_ms) -> TimerView`.
  - Invariants: `elapsed = clamp(now − started − paused_total − current_pause, 0, planned)`; `remaining = planned − elapsed`; while paused `elapsed` does not move; the session ends at exactly `planned_end = started + planned + paused_total`, and a late `advance` (after sleep) still records `ended_ms = planned_end`, not `now`.
- `Milestone` — `started | paused | resumed | ended(SessionRecord)`; one per transition, never per tick.
- `SessionRecord { id, preset, phase, planned_ms, started_ms, ended_ms, paused_total_ms, focused_ms, end_reason: completed | stopped, extensions: u8 (0 in A) }`.
- `TimerView { state: idle | running | paused, phase, mode: focus | paused | idle, remaining_ms, remaining: String, remaining_label: String, progress: f64, session_id: Option<Uuid>, preset: Option<Preset>, finish: Option<String>, store: StoreStatus, notifications: NotificationStatus }` — `progress` is the elapsed fraction in `[0, 1]` (what `TimerRing` takes); `mode` maps onto the design system's timer modes; `finish` is the formatted planned end while running or paused and `None` while idle (the idle preview travels in `clock-tick`). `StoreStatus = ok | unavailable | newer`. `NotificationStatus = not_determined | granted | denied | unavailable`.
- `format_remaining(ms) -> String` — `MM:SS`; `H:MM:SS` from 60 minutes up (a countdown is never clipped). `spoken_remaining(ms)` — "24 minutes 59 seconds", "1 minute", "45 seconds", "1 hour 30 minutes". `format_clock(epoch_ms, utc_offset_min: i32, HourCycle) -> String` — "15:20" or "3:20 PM"; the caller passes the offset for that instant.
- `TimerError` — `already_running | nothing_running | not_paused | invalid_spec`.
- `clock::Hlc { wall_ms, counter: u16, device_id }` — `tick(&mut self, now_ms) -> HlcStamp`; `HlcStamp` renders as `{wall_ms:013}-{counter:04}-{device_id}`, so string order is causal order. Pure; P10's sync protocol reuses it.
- `platform::KeepAwake` trait — `fn begin(&self, reason: &str) -> Result<Box<dyn Any + Send>, PlatformError>`; dropping the box ends the assertion. Core provides `NoopKeepAwake`.
- `platform::LocalTime` trait — `fn utc_offset_min(&self, at_epoch_ms: u64) -> i32; fn hour_cycle(&self) -> HourCycle`. Core provides `UtcLocalTime`.
- `platform::Notifier` trait — `fn status(&self) -> NotificationStatus; fn request(&self, done: Box<dyn FnOnce(NotificationStatus) + Send>); fn post(&self, title: &str, body: &str) -> Result<(), PlatformError>`. Core provides `NoopNotifier` (status `unavailable`, `post` logs nothing and returns `Unsupported`).

### Store: `crates/store` (schema v1, ADR-002 and ADR-012)
```sql
meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)
  -- schema_version, device_id (random UUIDv4 made on first open), hlc_last
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
- `setting` keyed by name and `active_session` as a singleton are the same kind of natural-key exception ADR-002 already makes for `HabitCheck`; `change_log.entity_id` carries the key, so the sync direction is unchanged.
- The live session is **device-only** (a session runs on one device at a time); finished sessions are **append-only and syncable**. This keeps `focus_session` true to ADR-002's "sessions are append-only" and makes relaunch recovery a one-row read.
- Repositories: `settings` (`get`, `set`), `focus_sessions` (`insert`, `list_between(start_ms, end_ms)`, `sum_focused_between`), `active_session` (`get`, `put`, `clear`). IDs are UUIDv7 made in the app crate (`uuid` with `v7`) from `SystemTime`; core and store never read the clock.

### Where each piece lives (ADR-001, ADR-010)
| Piece | Crate |
|---|---|
| Engine, presets, formatting, `Hlc`, the `KeepAwake`, `LocalTime` and `Notifier` traits with their no-op or UTC defaults | `crates/core` |
| SQLite, migrations, repositories, change-log writer | `crates/store` (new; depends on core for types; checked for the two mobile targets; not a WebAssembly target) |
| `MacKeepAwake` (`NSProcessInfo.beginActivity`, `userInitiatedAllowingIdleSystemSleep`), `MacLocalTime` (`NSTimeZone`, `NSLocale`), `MacNotifier` (`UNUserNotificationCenter`) | `crates/platform-macos` |
| Scheduler thread, session service, IPC, tray, windows, notifications, UUIDs, every `SystemTime::now()` | `apps/orasenda/src-tauri` |
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
  src/{session.rs, scheduler.rs, tray.rs, windows.rs, commands.rs (+timer, settings)}
                                           scheduler.rs replaces ticker.rs (one thread emits both clock-tick and timer-tick)
  src/tray/icons/{focus.png, paused.png, idle.png}   template images at 1x and 2x, from the mode shapes
  capabilities/main.json                   + allow-timer-*, allow-settings-*, allow-sessions-today
apps/orasenda/src/
  App.tsx                                  NavRail + page switch; Today is the only live page
  pages/{Today.tsx, Placeholder.tsx}       Placeholder renders EmptyState for the other five pages
  useTimer.ts, useMilestones.ts            subscribe() to timer-tick and timer-milestone
design/system/components/MenuBarTimer/README.md   + "Menu-bar glyphs" note and the exported shapes (design-first)
CONTEXT.md                                 domain terms
```

**Commands** (all `#[tauri::command] #[specta::specta]`, camelCase, `u64` exported as `Number`; errors serialized `{ kind, message }`):
- `timer_state() -> TimerState { view: TimerView, pending: Milestone[] }` — never errors; `idle` before the store has opened. `pending` holds milestones that happened before any webview was listening (`recovered`, `storeDegraded` at launch) and is drained by the call, so a milestone is never lost to the race between `listen` resolving and the first command.
- `timer_start(request: StartRequest { preset: Preset, custom: Option<CustomSpec> }) -> Result<TimerView, TimerCommandError>` — makes the UUIDv7, starts the engine, begins the `KeepAwake` activity, puts `active_session`, emits `timer-tick` and `timer-milestone started`, then, if the notification status is `notDetermined`, calls `Notifier::request` without waiting. "Just 2 minutes" sends `{ preset: "quick", custom: null }`. A store failure does not fail the start: the view comes back with `store: "unavailable"`.
- `timer_pause()`, `timer_resume()`, `timer_stop() -> Result<TimerView, TimerCommandError>` — `stop` records `end_reason: stopped`.
- `settings_get() -> TimerSettings { preset, custom, notifySessionEnd }` — defaults when the store is degraded. `preset` is never `quick`.
- `settings_set(settings: TimerSettings) -> Result<(), SettingsError>` — validates (`quick` and an out-of-range `custom` are `invalidSpec`), writes, then publishes one `clock-tick` at once so the idle finish preview follows the new preset without waiting for the next second.
- `sessions_today(dayStartMs: number) -> TodaySummary { sessions: number, focusedMs: number }` — sessions whose `ended_at ≥ dayStartMs`; B's deep-hours cap reuses it.
- `TimerCommandError.kind` — `alreadyRunning | nothingRunning | notPaused | invalidSpec | store`. `SettingsError.kind` — `invalidSpec | unavailable | write`.

**Events:**
- `clock-tick` with `ClockTick { epochMs, clock: string, idleFinish: string | null }` — once a second, always (as the shell's ticker does today), plus on `WindowEvent::Focused(true)` (`apps/orasenda/src-tauri/src/lib.rs:83-87`) and after `settings_set`. `clock` is the formatted wall clock; `idleFinish` is the finish time the chosen preset would have if started now, `null` while a session runs or is paused. This is what feeds Today while idle; the engine is not involved.
- `timer-tick` with `TimerView` — once a second while `running` or `paused`, plus once on every transition and on `Focused(true)`. Rendering is a pure function of the latest view. Nothing is emitted on this event while idle.
- `timer-milestone` with `{ kind: "started" | "paused" | "resumed" | "ended" | "recovered" | "storeDegraded", endReason?: "completed" | "stopped", sessionId?, store?: "unavailable" | "newer" }` — one-shot effects only: the hidden status announcement, the "Session ended" notice, the recovery notice, the single announcement that saving stopped working. `storeDegraded` is emitted once per entry into a degraded state (at launch when the open fails, or when the first write fails); a later successful write resets it so a second failure announces again.

**Scheduler (`scheduler.rs`).** One thread, `session-scheduler`, replaces the shell's `clock-ticker` (`apps/orasenda/src-tauri/src/ticker.rs:15-25`): sleep `delay_to_next_second(SystemTime::now())` (`crates/core/src/clock.rs:11`), then `now = epoch_ms(SystemTime::now())`, lock the session service, `advance(now)`, take the view and any milestone, unlock, then emit `clock-tick` (formatted with `LocalTime`), and, only when running or paused, emit `timer-tick`, set the tray title and icon and handle the milestone (persist, notify, drop the `KeepAwake` guard). Idle costs one `clock-tick` a second, which the shell already pays today; no database read happens per tick because the service caches the settings. Commands run the same "advance, then publish" step synchronously so the UI never waits for the next second.

**Menu bar (`tray.rs`).** `TrayIconBuilder` with a template icon per mode (circle for focus, pause bars for paused, hollow circle for idle; B adds the triangle and the half circle) and `set_title` with `remaining` while running or paused, empty when idle. Left click opens the native menu: *Pause* or *Resume*, *End session* (both absent when idle), *Show Orasenda*, *Quit Orasenda*. Menu items call the session service directly; no IPC. The design system's `MenuBarTimer` cannot render inside `NSStatusItem`, so the native item mirrors its compact form (digits plus a mode shape); the React component is used by C's floating window.

**Windows (`windows.rs`).** `CloseRequested` on `main` is prevented and the window hides. `RunEvent::Reopen` (Dock click) and *Show Orasenda* show and focus it. ⌘Q and *Quit Orasenda* quit without confirmation; the live session is already persisted. The activation policy stays `Regular`.

**Notification (`Notifier`).** At `ended` with `end_reason: completed`, `notify.session_end` true and status `granted`: `post("Focus session complete.", "Time for a break.")`. No notification for `stopped`. `MacNotifier` wraps `UNUserNotificationCenter.currentNotificationCenter`: `status` reads `getNotificationSettingsWithCompletionHandler` (blocking on a channel, off the main thread), `request` calls `requestAuthorizationWithOptions:(alert | sound)` and reports the answer through the callback, `post` adds a `UNNotificationRequest` with a fresh identifier and no trigger. `UNUserNotificationCenter` aborts outside an app bundle, so the app crate picks `MacNotifier` only when `NSBundle.mainBundle.bundleIdentifier` is present and otherwise `NoopNotifier` (status `unavailable`): an unbundled `tauri dev` run shows the end only in the app and the menu bar, and the acceptance uses the bundled debug app. No delegate is installed, so a notification is shown only while Orasenda is not the frontmost app; when it is, the Today notice is enough. The notification status is read at launch and after each `request`, and travels in `TimerView.notifications`.

**Relaunch recovery (`session.rs`, in `setup()`).** Read `active_session`. Planned end already passed: insert `focus_session` as `completed` at the planned end, clear the row, and put a `recovered` milestone in `pending`, which the first `timer_state` call returns (a milestone emitted before a listener exists would be lost). Otherwise restore `Running` or `Paused` as stored and begin the `KeepAwake` activity. A store that fails to open at launch puts `storeDegraded` in `pending` the same way.

**Today (`pages/Today.tsx`).** `h1` "Today". `TimerRing size={280}` with `remaining`, `remainingLabel`, `progress` and `mode` from the view and `clock` from the latest `clock-tick`. A `ModeChip` with the state word ("Focus", "Paused", "No session"). The preset choice is a native radio group using the design system's `.os-choice-group` and `.os-choice` classes (44 px targets), with two `Input`s for Custom minutes shown only when Custom is checked; changes call `settings_set`. `StartButton` with `onStart`, `onQuickStart` (sends `preset: "quick"`; B adds the keep-going prompt) and `finishTime` from `clock-tick.idleFinish`. While running or paused the StartButton is replaced by `Button variant="quiet"` *Pause* or *Resume* and `Button variant="ghost"` *End session*, so the screen keeps one primary; the ring's `clock` comes from `clock-tick.clock`. Under the Start button, while `view.notifications === "notDetermined"`, one `body-sm` `ink-muted` line reads "Orasenda can tell you when a session ends, even when its window is hidden." An `InlineNotice` slot under the ring shows at most one line, by priority: a one-shot notice from the latest milestone ("Session ended." with the ghost action *Start another*; "Your last session ended while Orasenda was closed."), dismissed by the next transition; otherwise the standing store line while `view.store !== "ok"` ("Orasenda can't save sessions right now." or "This data was saved by a newer Orasenda."), which stays as long as the state does. A visually hidden `role="status"` element announces each milestone's word once, including `storeDegraded` ("Saving is unavailable"); the standing line itself is never re-announced.

**App shell (`App.tsx`).** `NavRail` with `current` from local state; Today renders `Today`; the other five pages render `Placeholder` with `EmptyState` title "Nothing here yet." and message "This comes in a later phase." The spike `DevPanel` stays where it is (`apps/orasenda/src/App.tsx:56`) but moves under Today.

## Behavior & edge cases
- **Start while running or paused** → `alreadyRunning`; pause or end while idle → `nothingRunning`; pause while paused or resume while running → `notPaused`. No state changes on an error. Every command is safe to repeat from any window (ADR-013).
- **Custom out of range** → `invalidSpec` from both `settings_set` and `timer_start`; the `Input` helper says "Between 5 and 180 minutes." No alert styling. `quick` ignores the Custom range and is refused by `settings_set`.
- **Pause** records `pause_started_ms`; **Resume** adds the pause to `paused_total_ms` and moves the planned end. `TimerView.mode` becomes `paused`: the ring freezes, the chip reads "Paused", the menu bar shows the bars with the frozen digits.
- **End session** records `end_reason: stopped` and the actual `focused_ms`; it counts in `sessions_today` ([Open questions](#open-questions), 3). Copy: "Session ended.", never "abandoned" or "gave up".
- **Natural end**: `advance` returns `ended(record)`; the app crate inserts `focus_session`, clears `active_session` (one transaction), drops the `KeepAwake` guard, posts the notification, emits the view (`idle`) and the milestone. The tray title clears.
- **Sleep and wake:** the first scheduler wake after sleep finds `now ≥ planned_end` and ends the session at `planned_end`; the notification fires then, once. If the planned end has not passed, the view simply shows the true remaining time.
- **Clock set forward** → same path as wake. **Clock set back** → remaining grows by the jump; accepted and documented (FAQ). The engine clamps `elapsed` to `[0, planned]` and never panics.
- **Quit mid-session** → no dialog; `active_session` is written on every transition, never per tick. **Relaunch** → recovery as in [Interfaces](#interfaces). Paused sessions come back paused with the same remaining.
- **Close window** → hides; the process stays in the menu bar. **Dock click** or *Show Orasenda* → shows. Nothing is lost by closing.
- **Store cannot open** (corrupt file, permission denied) → the app runs with the engine in memory; `view.store = "unavailable"`; a `storeDegraded` milestone is announced once; Today keeps the standing line while the state lasts; `settings_set` returns `unavailable`. Never a modal, never `critical`.
- **`user_version` newer than this build** → the file is left untouched, `view.store = "newer"`, the standing line reads "This data was saved by a newer Orasenda.", and nothing is written until the app is updated.
- **Store write fails mid-flight** (disk full) → logged with `eprintln!`, the session continues, `view.store` becomes `unavailable` and `storeDegraded` is announced once; the next successful write returns it to `ok`.
- **Notification status `denied` or `unavailable`** → the end still shows in the app and in the menu bar; no line on Today and no second prompt. `settings.notifySessionEnd` is still honoured when the status later becomes `granted` through System Settings.
- **The notification request is answered while the session is running** → nothing changes on Today except the explanation line going away; the end notification follows the answer.
- **Emit fails** (no window listening) → logged, the loop continues, like the shell ticker.
- **Reduce motion** → the ring and chip changes are immediate (design system); nothing added.
- **StrictMode double mount** → hooks use the shell's `subscribe()` (`apps/orasenda/src/subscribe.ts:16-47`), so one listener remains.
- **Empty states**: idle Today shows the ring in `idle` mode ("No session") and the finish time for the chosen preset; `sessions_today` with no rows returns zeros.

## Data & migrations
- New database `orasenda.db` (WAL; `-wal` and `-shm` beside it) under `app_data_dir()`: `~/Library/Application Support/com.veloud.orasenda/` on macOS.
- `crates/store/migrations/0001_init.sql` creates the five tables above. The runner is generic from day one: numbered files embedded with `include_str!`, each applied in its own transaction, `PRAGMA user_version` set at the end, forward-only. A database with a newer `user_version` is refused (degraded mode above). B–E each add `000N_*.sql`.
- No backfill: there is no existing data. No compatibility concern: the shell wrote nothing to disk ([shell spec](2026-11-07-app-shell.md), "Data & migrations").
- `focus_session` carries `extensions` and `intent` now so B needs no migration for them; everything else B needs is added by B's own migration.

## Testing strategy
**Rust — `crates/core`** (`cargo test`): engine arithmetic with fixed `now_ms` (start, pause, resume, stop; `elapsed` frozen while paused; the planned end moves by the pause); a late `advance` ends at `planned_end`, not `now`; `elapsed` clamped on a backward clock, never negative, `progress` in `[0, 1]`; one milestone per transition and none per tick; `format_remaining` for 0, 59 s, 25 min, 90 min; `spoken_remaining` singular and plural; `format_clock` for both hour cycles and a negative UTC offset; preset specs; `CustomSpec` bounds; `Hlc` strictly increasing across equal and backward wall times and sortable as strings; serde shapes (`Preset` snake_case, `TimerView` camelCase, errors as `{kind, message}`).

**Rust — `crates/store`** (real SQLite in a temp dir, `cargo test`): a fresh file reaches v1 with `meta` filled and `journal_mode = wal`; reopen is idempotent; a newer `user_version` is refused; `settings.set` writes exactly one `change_log` row per changed field, with increasing `hlc` and the device id; `focus_sessions.insert` writes one row per field; `list_between` and `sum_focused_between` ignore tombstoned rows; `active_session` put, get and clear; a dropped connection without commit leaves the previous state (crash simulation); `open_in_memory()` for the app crate's tests.

**Rust — `crates/platform-macos`** (macOS only): `keep_awake_begins_and_ends` (no permission, no prompt); `local_time_offset_matches_ns_time_zone` and `hour_cycle_is_h12_or_h23`; `notifier_status_is_unavailable_outside_a_bundle` (the test binary has no bundle, so the selection logic must pick the no-op). Requesting and posting are manual (acceptance steps 2 and 7).

**Rust — app crate**: `SessionService` with an injected `now_ms`, `Store::open_in_memory()` and fake `Notifier`, `LocalTime` and `KeepAwake`: every transition, milestone order, `quick` start with `QUICK_START_MS`, recovery in both branches with the milestone in `pending` and drained by `timer_state`, `store` status across a failing write and the next success (one `storeDegraded` per entry), `idleFinish` null while running and formatted while idle, `settings_set` refusing `quick` and out-of-range Custom, the request made only when `notDetermined`, the tray title and icon chosen per view; the existing `manifest_commands_match_specta_builder` and capability tests cover the new commands; `export_bindings` includes `timerTick`, `timerMilestone` and the extended `clockTick`.

**UI — Vitest + `mockIPC`**: *Start focus* calls `timer_start` with the checked preset and *Just 2 minutes* with `quick`; a `clock-tick` renders the wall clock and the idle finish time; a `timer-tick` renders the digits, the chip word and the planned finish; `paused` renders "Paused"; the `ended` milestone announces once and shows the notice with *Start another*; `recovered` returned in `timer_state().pending` shows its notice; `store: "unavailable"` shows the standing line on mount without an announcement, and a `storeDegraded` milestone announces once; the explanation line shows only while `notDetermined`; Custom shows the two inputs and an `invalidSpec` reply shows the helper; the rail switches pages and the other pages render `EmptyState`; one listener remains under StrictMode.

**`ci.sh`**: the core boundary check also rejects `rusqlite`; the mobile `cargo check` adds `-p orasenda-store`; `clippy` and `cargo test` cover the new crate.

**End-to-end**: none automated (no WebDriver for WKWebView, as the shell spec records).

**Manual macOS acceptance** (recorded in the PR, in the bundled debug app):
1. Classic session: ring, chip and menu-bar title agree; Pause and Resume from Today and from the menu-bar menu; End session records a `stopped` row (checked with `sqlite3`).
2. Start, ⌘H for 25 minutes: the menu bar counts the whole time; the end notification arrives within 1 s of the planned end; Activity Monitor's App Nap column reads "No" during the session.
3. Start, close the window, reopen from the Dock: the ring shows the true remaining time.
4. Start a 5-minute Custom session, `pmset sleepnow` for 7 minutes: one notification after wake; the row's `ended_at` equals the planned end.
5. Start, ⌘Q at 12:00 remaining, relaunch: the ring resumes near 10:00. Then quit again, wait past the planned end, relaunch: one "ended while Orasenda was closed" notice and a `completed` row.
6. Set the clock forward 10 minutes mid-session (the session ends); set it back (the remaining grows; nothing crashes).
7. Deny the notification permission in a fresh install: the end still shows in the app and the menu bar; no second prompt.
8. Light and dark; the 24-hour setting on and off (the finish time follows); VoiceOver reads the ring name, chip, buttons and menu-bar items; a keyboard-only run from launch to a completed session.
9. CPU: `top` over 5 minutes with a session running and the window hidden, below 0.5 % average.

### Dependencies to vet (`baton:deps`, versions read from the registries at plan time)
| Ecosystem | Package | Note |
|---|---|---|
| cargo | rusqlite (`bundled`) | must `cargo check` for `aarch64-apple-ios` and `aarch64-linux-android` |
| cargo | uuid (`v7`, `serde`) | app crate only |
| cargo | tauri feature `tray-icon` | same 2.12.x pin |
| cargo | objc2-user-notifications 0.3.2 | `UNUserNotificationCenter`; already in `Cargo.lock` through Tauri, so no second copy |
| cargo | objc2-foundation features for `NSProcessInfo`, `NSTimeZone`, `NSLocale`, `NSBundle` | already in the tree at the Tauri-matched version |

`tauri-plugin-notification` was considered and rejected (see [FAQ](#why-not-tauri-plugin-notification)).

## Decisions
- [ADR-011: Time and scheduling](../DECISIONS.md#adr-011-time-and-scheduling) — proposed by this spec; accepted by its last task.
- [ADR-012: Store crate API](../DECISIONS.md#adr-012-store-crate-api) — proposed by this spec; accepted by its last task.
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
Its desktop implementation never asks for permission (`request_permission` and `permission_state` return `Granted`, 2.8.0 `src/desktop.rs:193-206`), posts on macOS through `notify-rust` and `mac-notification-sys`, which use the deprecated `NSUserNotification` API, and under `tauri dev` sets the sending application to `com.apple.Terminal` (`desktop.rs:518-524`). Orasenda asks at the moment of need and must be honest about the answer, so it talks to `UNUserNotificationCenter` through a core trait and a `platform-macos` implementation, the same layout as every other OS call (ADR-010).

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
3. **Does a session ended early count its minutes?** (decided by the owner, 2026-11-08, as recommended) Yes: record `focused_ms` with `end_reason: stopped` and count it toward today's focused time and, in B, the deep hours. Nothing a person did is lost, and the copy never judges.

## Implementation status
- [ ] Plan: `docs/plans/2026-11-08-focus-session-loop.md`
- [ ] Issues
- [ ] ADR-011, ADR-012, ADR-013 accepted
