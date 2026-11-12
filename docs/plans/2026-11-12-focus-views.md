# Focus views (P1 sub-project D) — Implementation Plan

- Spec: [docs/specs/2026-11-12-focus-views.md](../specs/2026-11-12-focus-views.md) (approved by the owner 2026-11-12)
- Date: 2026-11-12
- Status: draft

## Overview
Eight tasks, one PR each. The roadmap estimated five; the extra three are the move-only split the 500-line rule forces (D1), the platform work kept apart so its risk shows early (D3), and the store and service foundation (D2).
- **Wave 1, foundations, in parallel:**
  - D1: the move-only split of `tray/menu.rs` (352 lines) and of `lib.rs`'s test module (`lib.rs` is 348 lines and D adds a builder entry per command and three capability tests). It lands first so E's tray tasks rebase on it.
  - D2: the `window_frame` table, its repository, the clamp and default frame, `run_view` and `run_select_preset`, all without Tauri.
  - D3: the AppKit code in `crates/platform-macos/src/windows/`: displays, the Focus window and floater configuration, key without activation, frames, the screen observer, and the local key monitor that is the floater keys' fallback.
- **Wave 2, the contract:** D4 adds the windows module, every new command and event, the capability files, the bindings, and the two new HTML entries with stub pages, so the three frontend surfaces build against one contract.
- **Wave 3, the surfaces, in parallel:** the native menus and display changes (D5), the Focus window page (D6), the floater page and its keys (D7).
- **Wave 4:** the main window's Focus view button, the Pages "Commands…" item and the ⌘K palette (D8). D8 also accepts ADR-016 and marks the spec implemented.

D builds no design-system component (spec Non-goals). If one turns out to be needed, it is its own code-first PR with a first-consumer check (`docs/conventions.md`, "Design-system changes are checked against their first consumer").

## Contract
D4 owns every IPC change:
- commands `displays_list`, `focus_view_open`, `focus_view_close`, `main_show`, `timer_view`, `preset_select`, and the changed `native_menu_popup` (the calling window);
- events `focus-insets` (one Focus window) and `palette-open` (`main`, no payload);
- types `DisplayInfo`, `FocusViewTarget`, `FocusViewError`, `FocusInsets`;
- `commands.list.rs`, the specta builder, `capabilities/{main,focus,floater}.json` and their tests;
- the regenerated `apps/orasenda/src/ipc/bindings.ts` and the fixtures in `apps/orasenda/src/test/fixtures.ts`.

D5, D6, D7 and D8 build against D4's bindings. D2 owns the service functions the commands call; D3 owns the AppKit functions the windows module calls.

## Impact
- **Public IPC and permissions:** six new commands and two events. `main.json` gains exactly `allow-displays-list` and `allow-focus-view-open`; `focus.json` (`focus-*`) and `floater.json` (`floater`) are new, with the spec's exact lists (spec, Users & permissions). `native_menu_popup` changes behaviour for its one caller today (`PagesButton`, the Settings jump menu): `main` still gets its menu in `main`. Every command goes into `commands.list.rs`, which `build.rs` reads for the `AppManifest`; `manifest_commands_match_specta_builder` keeps the two lists equal.
- **Call paths:** `lifecycle::install` routes window events for `focus-*` and `floater` to the new `windows` module; `on_close_requested` keeps hiding `main` only. The app menu gains the Focus menu after View; `lib.rs`'s `on_menu_event` dispatches through `menu::on_menu_event`. The tray's `MenuEntry::Item.id` becomes `String`, and its Preset submenu reads `preset_lengths()`.
- **Data and migrations:** one additive table, `window_frame`, device-only (ADR-012), no backfill. The migration number is provisional (`0003`) until it lands (see Shared with E). Forward-only: once a database is at the new version, a build without D2 refuses to open it. Dev data is disposable, so rollback of D2 means deleting `~/Library/Application Support/com.veloud.orasenda`.
- **Shared modules:** `tray/menu.rs` (moved by D1), `lib.rs` (tests moved by D1), `commands/menu_popup.rs`, `features/today/{PresetSummary.tsx,presets.ts}` (Today, the Focus window and the palette read `presetChoices`).
- **Tests that must stay green:** `cargo test` for `orasenda-store`, `orasenda-service`, `orasenda-platform-macos` and the app crate (tray `menu_items` cases, `app_menu` id disjointness, menu popup cases, capability tests); Vitest for Today, `PresetSummary`, `PagesButton`, App and Settings' jump menu; `just layout` (every Today case, the component specs); the bindings check; `just file-size`; `just mobile`.
- **Rollout and rollback:** each task is one squash-merged PR, revertible on its own after its dependants are reverted. Entry points (the Today button, the Focus menu, the tray items, the palette rows) arrive in D5 and D8, so reverting those two hides D without touching the windows behind them.

## Dependency graph
```
D1 ──┐
D2 ──┼──> D4 ──┬──> D5 ──┐
D3 ──┘         ├──> D6 ──┼──> D8
               └──> D7 ──┘
```
Can start immediately in parallel: D1, D2, D3.

D4 depends on D1, D2 and D3. D5, D6 and D7 depend on D4 (D5 edits D1's split files). D8 depends on D6 for `presetChoices`, and on D5 and D7 only so that it lands last and can close the spec.

| Wave | Runs at once | Starts when |
|---|---|---|
| 1 | D1, D2, D3 | now |
| 2 | D4 | D1, D2 and D3 merged |
| 3 | D5, D6, D7 | D4 merged |
| 4 | D8 | D5, D6 and D7 merged |

D and E share one budget of three concurrent pipelines; the controller interleaves them (ruling 11, see Shared with E).

## Notes for every task
- **Checks:** implementers (sonnet) run only fast checks: `cargo test -p <crate>`, `pnpm --filter orasenda test` and `typecheck`, `just file-size`, `just mobile` for any Rust change, and their own Playwright specs (`pnpm exec playwright test <spec>`). The controller runs the full `baton verify` at landing.
- **Build dirs:** each task sets its own `CARGO_TARGET_DIR` (`target/d1` … `target/d8`) so parallel builds don't block on one lock.
- **Visuals:** no screenshots in PRs. Each UI task lists, under "Not yet verified", the states and sizes the owner checks by eye in light and dark.
- **VoiceOver** is deferred to #326. Names and roles are asserted in code (Vitest `getByRole` with names).
- **Registration:** a task that adds a command, an event or a managed type lists `lib.rs`, `commands.list.rs` and `commands/mod.rs` in Owns or Touches (`docs/conventions.md`, Process).
- **Sizes today** (`wc -l`): `tray/menu.rs` 352, `lib.rs` 348, `lifecycle.rs` 312, `tray/tests/menu_items.rs` 324, `tray/tests.rs` 299, `menu_popup.rs` 265, `ipc.rs` 179, `app_menu.rs` 158, `platform-macos/src/overlay.rs` 412, `store/src/tests.rs` 439, `service/session/run.rs` 122, `service/session/service.rs` 165, `Today.tsx` 262, `App.tsx` 173, `PresetSummary.tsx` 141, `presets.ts` 104, `today.css` 135, `statusLine.ts` 72, `PagesButton.tsx` 67, `scenarios.ts` 124, `layoutMain.tsx` 66. No task below pushes a listed file past 500; new tests go in new files where a file is above 300.

## Tasks

### D1: Move-only split of the tray menu and `lib.rs`'s tests
- Priority: 0
- Depends on: none
- Owns:
  - `apps/orasenda/src-tauri/src/tray/menu.rs` → `tray/menu/mod.rs` (ids, `NextSession`, `MenuEntry`, re-exports), `tray/menu/entries.rs` (`menu_items`, `item`, `with_accelerator`, preset ids and labels), `tray/menu/commands.rs` (`MenuCommand`, `menu_command`, `start_action`, `settings_target`, `preset_choice`, `run_command`, `on_menu_event`), `tray/menu/native.rs` (`append_entries`, `build_menu`)
  - `apps/orasenda/src-tauri/src/lib.rs` (its `#[cfg(test)] mod tests` moves out) and the new `apps/orasenda/src-tauri/src/lib_tests.rs`
- Touches: `apps/orasenda/src-tauri/src/tray/mod.rs` (`use` paths only, if a re-export can't keep them).
- Interfaces: none; every public path stays the same through `tray/menu/mod.rs` re-exports.
- Acceptance:
  - [ ] `git diff -M --stat` shows moves; the PR lists each moved block and confirms no line changed except `use`, `mod` and visibility needed to compile.
  - [ ] `cargo test` for the app crate passes with the same test count before and after (paste both counts).
  - [ ] Every new file ≤ 300 lines; `just file-size` and `just mobile` pass.
- Tests first: none new (move-only); the existing `menu_items_*`, `header_*`, retry and `lib` tests are the check.
- Notes: haiku or sonnet. A refactor PR moves code or changes it, never both. Land it before any E task that touches the tray.

### D2: Window frames in the store and service, `run_view`, `run_select_preset`
- Priority: 0
- Depends on: none
- Owns:
  - `crates/store/migrations/0003_window_frame.sql` (provisional number), `crates/store/src/migrate.rs` (`MIGRATIONS` entry), `crates/store/src/lib.rs` (`SCHEMA_VERSION`, the `repo` re-export)
  - `crates/store/src/repo/{mod.rs,window_frames.rs}` (tests inline, including the migration from version 2)
  - `crates/service/src/windows.rs` (new, pure) and its `mod` line in `crates/service/src/lib.rs`
  - `crates/service/src/session/frames.rs` (new: the store calls, the in-memory fallback, `run_frame_*`), its `mod` line in `session/mod.rs`
  - `crates/service/src/session/run.rs` (`run_view`, `run_select_preset`)
  - `crates/service/src/session/tests/{frames.rs,view_select.rs}` (new) and their `mod` lines
- Touches: `crates/service/src/session/service.rs` (one field: the in-memory frames, `HashMap<(String, String), Frame>`), `crates/service/src/session/view.rs` (read: `SessionService::view`), `crates/store/src/repo/active_session.rs` (pattern).
- Interfaces:
  - Produces:
    - `orasenda_store::window_frames::{get(txn: &Txn, window: &str, display: &str) -> Result<Option<StoredFrame>, StoreError>, latest(txn: &Txn, window: &str, displays: &[&str]) -> Result<Option<(String, StoredFrame)>, StoreError>, put(txn: &Txn, window: &str, display: &str, frame: StoredFrame, now_ms: u64) -> Result<(), StoreError>}` with `StoredFrame { x: i64, y: i64, width: i64, height: i64 }`.
    - `orasenda_service::windows::{Frame { x: i32, y: i32, width: u32, height: u32 }, Limits { min_width: u32, min_height: u32, max_width: u32, max_height: u32 }, frame_within(stored: Frame, visible: Frame, limits: Limits) -> Frame, default_frame(visible: Frame, size: (u32, u32), inset: u32) -> Frame}`. All frames are integer points relative to the display frame's top-left; `visible` is the display's `visibleFrame` in that space.
    - `session::{run_frame_load<H: Host>(host: &H, window: &str, displays: &[&str]) -> Option<(String, Frame)>, run_frame_get<H: Host>(host: &H, window: &str, display: &str) -> Option<Frame>, run_frame_save<H: Host>(host: &H, window: &str, display: &str, frame: Frame)}`.
    - `session::run_view<H: Host>(host: &H) -> TimerView` (the lock, `SessionService::view(now_ms)`, no tick, no publish; idle before setup).
    - `session::run_select_preset<H: Host>(host: &H, preset: Preset) -> Result<(), TimerCommandError>`: checks idle and saves under one lock, then runs `run_set_settings`'s after-unlock effects (theme unchanged, `clock-tick`, `settings-changed`).
- Acceptance:
  - [ ] Migration applies on a version-2 database; `window_frame` has the spec's columns and key; `SCHEMA_VERSION` equals the last entry (the const assert).
  - [ ] `put` writes no `change_log` row; the module doc says device-only (ADR-012).
  - [ ] `latest` returns the connected display with the newest `updated_at`; an unknown display list returns `None`.
  - [ ] `frame_within`: too large → clamped to the limits; outside `visible` → moved inside keeping its size; inside → unchanged. `default_frame` is the top-right of `visible` inset by `inset`.
  - [ ] A failed or degraded store write is logged and kept in memory; `run_frame_get` returns the in-memory frame for this run.
  - [ ] `run_view` leaves `pending` and `listening` untouched (`run_state` afterwards still drains `recovered`).
  - [ ] `run_select_preset` while running or paused returns `WrongState` and saves nothing; while idle it saves only `preset` and emits `settings-changed` once. A failed save maps to `TimerCommandError { kind: Store }` (ruling 4); `WrongState` stays as a guard although the summary only shows idle or ended (ruling 3).
- Tests first: `window_frame_migrates_from_v2`, `window_frame_put_writes_no_change_log`, `window_frame_latest_newest_connected`, `frame_within_clamps_oversize`, `frame_within_moves_offscreen_inside`, `frame_within_keeps_fitting_frame`, `default_frame_top_right_inset`, `frame_save_store_down_kept_in_memory`, `run_view_keeps_pending_and_listening`, `select_preset_refused_while_running`, `select_preset_idle_saves_only_preset`, `select_preset_refused_when_start_wins_race` (two threads, barrier, no sleeps).
- Notes: sonnet. `SessionService.store` is `pub(super)` to `session`, so the store calls live in `session/frames.rs` and only the pure clamp in `windows.rs` (the spec names one file; see the gaps in the PR body). Rename the migration at landing if E's lands first.

### D3: AppKit windows: displays, Focus window, floater panel, keys
- Priority: 0
- Depends on: none
- Owns:
  - `crates/platform-macos/src/windows/{mod.rs,displays.rs,focus_window.rs,floater.rs,keys.rs}` (new) and the `mod` line in `crates/platform-macos/src/lib.rs`
  - `crates/platform-macos/src/overlay.rs` (only `swap_to_panel_class` becomes `pub(crate)`)
  - `crates/platform-macos/Cargo.toml` (only if a CoreGraphics feature is needed; `baton:deps` first)
- Touches: `crates/platform-macos/src/overlay.rs:30-46,112-200` (read: the `# Safety` contract and the class swap).
- Interfaces:
  - Produces (each `unsafe fn` with `overlay.rs`'s `# Safety` contract, refusing off the main thread and on a null pointer):
    - `displays() -> Vec<Display>` with `Display { id: String, name: String, frame: Rect, visible: Rect }` (global top-left points) in `NSScreen.screens` order; `display_key(id) -> String`.
    - `configure_focus_window(ns_window, display_id: &str) -> Result<(), WindowError>`: frame = the display's `frame`, `NSNormalWindowLevel`, `fullScreenAuxiliary | moveToActiveSpace`.
    - `configure_floater(ns_window) -> Result<(), WindowError>`: the panel class swap, `nonactivatingPanel`, `NSFloatingWindowLevel`, `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`, `hidesOnDeactivate = NO`.
    - `key_without_activation(ns_window)`: `orderFrontRegardless` then `makeKeyWindow`.
    - `frame_of(ns_window) -> Option<(String, Rect)>` and `set_frame(ns_window, display_id: &str, frame: Rect) -> Result<(), WindowError>`, display-relative top-left.
    - pure `to_top_left(appkit: Rect, primary_height: f64) -> Rect` and its inverse.
    - `observe_screen_changes(callback: Box<dyn Fn() + Send + Sync>)`.
    - pure `floater_key(key_code: u16, modifiers: Modifiers) -> Option<FloaterKey>` with `FloaterKey { Space, Return, Escape, FullScreen, FloatingTimer, Commands }`, and `install_floater_key_monitor(ns_window, handler: Box<dyn Fn(FloaterKey) -> bool>)`: a local `NSEvent` monitor that consumes a key only when the floater is key and the handler returns true.
- Acceptance:
  - [ ] Every `unsafe fn` refuses off the main thread and on a null pointer, tested as in `overlay.rs`.
  - [ ] `to_top_left` round-trips with its inverse on a two-display layout (a display above and one to the left of the primary).
  - [ ] `floater_key` maps exactly Space, Return, Esc, ⇧⌘F, ⇧⌘T and ⌘K; any other modifier set is `None`.
  - [ ] Open question 2 answered in the PR: the display key is the `CGDisplayCreateUUIDFromDisplayID` UUID string, or the fallback (`NSScreenNumber` + `localizedName`); either way `display_key` returns only `[A-Za-z0-9-]`, so `focus-<key>` is a valid Tauri label.
  - [ ] `overlay.rs` gains no line except the visibility change; every new file ≤ 300 lines.
- Tests first: `windows_fns_refuse_off_main_thread`, `windows_fns_refuse_null_window`, `to_top_left_round_trips_two_displays`, `floater_key_maps_six_keys_only`, `display_key_is_label_safe`.
- Notes: sonnet, opus review. The AppKit behaviour itself is the owner's hands-on check (Hands-on list H1–H6). The key monitor is built and tested here; D7 decides whether it is installed.

### D4: The windows module and the IPC contract
- Priority: 0
- Depends on: D1, D2, D3
- Owns:
  - `apps/orasenda/src-tauri/src/windows/{mod.rs,focus.rs,floater.rs,frames.rs}` (new: the pure window specs, the builders, main's recorded frame, the 500 ms trailing frame debouncer, `floater_shown`) and its `mod` line in `lib.rs`
  - `apps/orasenda/src-tauri/src/commands/{focus_views.rs,menu_popup.rs,mod.rs}`
  - `apps/orasenda/src-tauri/src/ipc.rs` (the new types and events)
  - `apps/orasenda/src-tauri/src/runtime/session.rs` (wrappers for D2's `run_*`)
  - `apps/orasenda/src-tauri/src/lifecycle.rs` (route `focus-*` and `floater` window events; record `main`'s frame on `Moved`, `Resized` and show)
  - `apps/orasenda/src-tauri/{commands.list.rs,capabilities/main.json,capabilities/focus.json,capabilities/floater.json}`
  - `apps/orasenda/src-tauri/src/lib.rs` (builder lines) and `src/lib_tests.rs` (capability and bindings tests)
  - `apps/orasenda/src/ipc/bindings.ts` (regenerated), `apps/orasenda/src/test/fixtures.ts`
  - `apps/orasenda/{focus.html,floater.html}`, `apps/orasenda/vite.config.ts` (two inputs), `apps/orasenda/src/viteConfig.test.ts`
  - `apps/orasenda/src/features/focus/{main.tsx,FocusPage.tsx}` and `apps/orasenda/src/features/floater/{main.tsx,FloaterPage.tsx}` (stubs: apply the theme, render an empty labelled `main`)
  - `apps/orasenda/src/features/timer/{useSurfaceTimer.ts,useSurfaceTimer.test.tsx}` (new)
  - `apps/orasenda/src/dev/layout/{layoutMain.tsx,scenarios.ts,scenarios.test.ts}` (`?surface=focus|floater`, `&insets=t,r,b,l`, `&displays=1|2|3`; answers for every new command and every state D6 and D7 need, so neither parallel task edits these files)
- Touches: `packages/tokens/tokens.json` (read: `floater-*`, `space-6`), `apps/orasenda/src/app/useTheme.ts` (consume), `apps/orasenda/src/ipc/subscribe.ts` (consume).
- Interfaces:
  - Consumes: D2's `run_view`, `run_select_preset`, `run_frame_load`, `run_frame_get`, `run_frame_save`, `frame_within`, `default_frame`; D3's `displays`, `configure_focus_window`, `configure_floater`, `key_without_activation`, `frame_of`, `set_frame`.
  - Produces:
    - `displays_list() -> Vec<DisplayInfo>`, `DisplayInfo { id: String, name: String, has_main_window: bool }` → TS `commands.displaysList(): Promise<DisplayInfo[]>`.
    - `focus_view_open(target: FocusViewTarget) -> Result<(), FocusViewError>`, `FocusViewTarget = { kind: "fullScreen", displayId: string } | { kind: "floater" }`, `FocusViewError { kind: "unavailable" | "noDisplay", message }`.
    - `focus_view_close() -> Result<(), FocusViewError>` (refused for `main`), `main_show()`, `timer_view() -> TimerView`, `preset_select(preset: Preset) -> Result<(), TimerCommandError>`.
    - events `FocusInsets { top, right, bottom, left }` (`focus-insets`) and `PaletteOpen` (`palette-open`).
    - `windows::{focus_label(display_id: &str) -> String, open_focus(app, display_id) -> Result<(), FocusViewError>, open_floater(app) -> Result<(), FocusViewError>, close_floater(app), floater_shown(app) -> bool, main_display(app) -> Option<String>, open_palette(app), surfaces_changed(app)}`. `open_palette` runs `show_main` and emits `palette-open` to `main`; D5's ⌘K item and D7's key monitor both call it. `surfaces_changed` is called on floater open and destroy and on a display change; its body is empty until D5 fills it, so D5 never edits D7's `floater.rs`.
    - `useSurfaceTimer(): { view: TimerView | null; ended: boolean; failed: boolean }` (initial `timer_view`, then `timer-tick` and `timer-milestone`; `ended` set by the `ended` milestone and cleared by the next non-idle view; never calls `timer_state`).
- Acceptance:
  - [ ] `focus_window_spec` (label `focus-<key>`, `focus.html?display=<id>&insets=…`, no decorations, not resizable, skip taskbar, hidden until framed) and `floater_window_spec` (`floater.html`, sizes equal the `floater-*` tokens, read from `tokens.json` in the test) pass.
  - [ ] `focus_view_open` fullScreen on a display with a Focus window focuses it; an unknown display answers `noDisplay`; off macOS every command answers `unavailable` and `displays_list` answers `[]`.
  - [ ] `focus_view_open` floater opens at `run_frame_load`'s frame clamped with `frame_within`, or `default_frame` on the main window's display; shows it with key focus without activating; then hides `main`. Calling it while shown gives key focus and still hides `main`; one window exists.
  - [ ] Opening or closing a view never calls the session service (a counting `Host` test).
  - [ ] `on_close_requested` hides only `main`; `focus-*` and `floater` close. The floater's frame is read on `CloseRequested` (not `Destroyed`) and saved; drags save at most once per 500 ms, trailing.
  - [ ] `native_menu_popup` pops up in the calling window (`menu_popup_targets_calling_window`).
  - [ ] Capability tests assert each file's exact `windows` pattern list and exact permissions (`main`, `focus-*`, `floater`, `dev`, `overlay`), and that `focus.json` and `floater.json` lack `timer_state` and `settings_set`. `manifest_commands_match_specta_builder` passes.
  - [ ] Bindings regenerated and committed; fixtures updated; `pnpm --filter orasenda typecheck` and `test` pass.
  - [ ] `layout.html?surface=focus` and `?surface=floater` load the stubs; `scenarios_answer_core_commands` covers the new commands.
- Tests first: `focus_window_spec_matches_spec`, `floater_window_spec_uses_tokens`, `focus_label_is_valid_for_any_display_id`, `focus_view_open_unknown_display_is_no_display`, `focus_view_open_floater_twice_one_window`, `focus_view_close_refused_for_main`, `open_close_never_touch_session`, `close_requested_focus_and_floater_close`, `floater_frame_saved_on_close_requested`, `frame_debounce_trailing_500ms`, `menu_popup_targets_calling_window`, `focus_capability_exact`, `floater_capability_exact`, `main_capability_exact`, `use_surface_timer_never_calls_timer_state`, `use_surface_timer_ended_until_next_start`.
- Notes: sonnet, opus review. Create windows from a `spawn_blocking` thread (window creation waits on the main thread) and run the AppKit calls on the main thread with no lock held (`tray/mod.rs` doc). This is the largest task; if it passes four hours, the controller moves `frames.rs` and the frame acceptance to D7.

### D5: Native menus and display changes
- Priority: 1
- Depends on: D1, D4
- Owns:
  - `apps/orasenda/src-tauri/src/menu/{mod.rs,app_menu.rs,focus_menu.rs}` (`focus_menu.rs` new: `focus_menu_entries`, the native build, its events; `mod.rs` dispatches by prefix)
  - `apps/orasenda/src-tauri/src/tray/menu/{mod.rs,entries.rs,commands.rs,native.rs}` (Full screen, Show/Hide floating timer, Preset submenu from `preset_lengths()`, `id: String`)
  - `apps/orasenda/src-tauri/src/tray/tests/focus_items.rs` (new) and its `mod` line in `tray/tests.rs`
  - `apps/orasenda/src-tauri/src/windows/displays.rs` (new: the screen-parameters handler) and its `mod` line in `windows/mod.rs`
  - `apps/orasenda/src-tauri/src/lib.rs` (`on_menu_event` calls `menu::on_menu_event`; installs the screen observer)
- Touches: `apps/orasenda/src-tauri/src/tray/{mod.rs,render.rs}` (the floater flag and displays in the render input), `apps/orasenda/src-tauri/src/tray/tests/menu_items.rs` (only the `id` type in existing cases), `apps/orasenda/src-tauri/src/windows/mod.rs` (fills D4's `surfaces_changed` body and adds the `displays` `mod` line; D7 never edits `mod.rs`), `crates/service/src/api/settings.rs` (read `preset_lengths`).
- Interfaces:
  - Consumes: `windows::{open_focus, open_floater, close_floater, floater_shown, main_display}`, `displays_list`'s order, `PaletteOpen` (D4).
  - Produces: `focus_menu_entries(displays: &[DisplayInfo], floater_shown: bool) -> Vec<FocusMenuEntry>`; `menu_items(view: &TimerView, next: &NextSession, focus: &FocusItems, spike: bool) -> Vec<MenuEntry>` with `FocusItems { displays: Vec<DisplayInfo>, floater_shown: bool }`; `windows::displays::on_screens_changed(app: &AppHandle)`.
- Acceptance:
  - [ ] The Focus menu sits after View: "Full Screen" ⇧⌘F with one display, or a "Full Screen ▸" submenu (main window's display first, ⇧⌘F on it only); "Floating Timer" ⇧⌘T; a separator; "Commands…" ⌘K. The accelerators are registered only here.
  - [ ] ⌘⇧T opens the floater or gives it key focus, never hides it. ⌘K calls `windows::open_palette`; a Focus window or floater stays as it is.
  - [ ] Ids are `focus:`-prefixed and disjoint from the tray's and `popup:` (`focus_menu_ids_disjoint`).
  - [ ] Tray, idle and running: after the session group and before Show Orasenda, a separator, "Full screen" (or the submenu) and "Show floating timer" / "Hide floating timer", with no accelerators. The Preset submenu comes from `preset_lengths()` plus the saved Custom; `PRESETS` is gone.
  - [ ] Closing the floater by any path redraws the tray label and the Focus menu.
  - [ ] On a screen-parameters change: both menus rebuild, each Focus window is re-framed and gets `focus-insets`, a Focus window whose display is gone closes, and a floater whose display is gone moves to the main window's display at its stored or default frame. No window takes key focus.
  - [ ] Open question 3 recorded in the PR: one ⌘K in `main` reaches the menu once (code path asserted; the hands-on check is H7).
- Tests first: `focus_menu_entries_one_display`, `focus_menu_entries_two_displays_main_first`, `focus_menu_entries_three_displays_shortcut_on_first_only`, `focus_menu_ids_disjoint`, `tray_focus_items_idle`, `tray_focus_items_running`, `tray_floater_label_toggles`, `tray_presets_from_preset_lengths`, `screens_changed_closes_focus_on_gone_display`, `screens_changed_moves_floater_to_main_display`, `cmd_k_emits_palette_open_once`.
- Notes: sonnet. E also changes the tray entries; D5 and E's tray task never run at once (Shared with E).

### D6: The Focus window page
- Priority: 1
- Depends on: D4
- Owns:
  - `apps/orasenda/src/features/focus/{FocusPage.tsx,main.tsx,focus.css,FocusPage.test.tsx,FocusPage.keys.test.tsx}`
  - `apps/orasenda/src/features/today/presets.ts` (`presetChoices(settings, lengths)`; `CHOICES` moves here from `PresetSummary.tsx`) and `presets.test.ts`
  - `apps/orasenda/src/features/today/PresetSummary.tsx` (the Focus-window form: no Settings row, heading "Preset for the next session", line "Choosing one applies it and closes.") and `PresetSummary.test.tsx`
  - `verification/layout/focusWindow.spec.ts` (new)
- Touches: `apps/orasenda/src/features/timer/{useSurfaceTimer.ts,useClock.ts}`, `apps/orasenda/src/app/useTheme.ts` (consume), `apps/orasenda/src/features/today/Today.tsx` (consumes the changed `PresetSummary`; unchanged).
- Interfaces:
  - Consumes: `useSurfaceTimer`, `commands.{timerView,timerStart,timerPause,timerResume,timerStop,settingsGet,presetsGet,presetSelect,focusViewClose}`, `events.focusInsets` (D4).
  - Produces: `presetChoices(settings: Settings, lengths: PresetLength[]): Array<{ preset: Preset; label: string; meta: string; checked: boolean }>`.
- Acceptance:
  - [ ] The body is padded by the insets from the URL and follows `focus-insets`; the background fills the whole window.
  - [ ] `FullScreenFocus` gets the view's props, `summary` only while idle or ended, as the READMEs say (ruling 3; saving through `preset_select`), `singleKeys={false}`, `ended` from `useSurfaceTimer`.
  - [ ] ⌘↩ starts the saved preset with `custom: null` only while idle or ended; ⌘. ends only while running or paused; neither is prevented otherwise.
  - [ ] `onExit` (after the dialog's confirm) calls `focus_view_close`; Esc alone never closes.
  - [ ] A failed command shows its message in the status line; an unreadable view shows "Orasenda can't reach the timer. Close this window and try again."
  - [ ] Today's `PresetSummary` tests and every Today harness case still pass.
  - [ ] `focusWindow.spec.ts`: 1280×720, 1920×1080, 390×844, 1440×900, 1000×440 and 360×240 × focus, paused, idle and ended, with and without insets, both themes and reduced motion: no scroll, controls inside the viewport and inside the insets, targets ≥ 44×44, the focus ring at each stop.
- Tests first: `focus_page_reads_timer_view_not_state`, `focus_page_insets_from_query_and_event`, `focus_cmd_enter_starts_saved_custom_null`, `focus_cmd_period_ends_only_in_session`, `focus_exit_closes_only_after_confirm`, `focus_command_failure_in_status_line`, `focus_view_unreadable_line`, `preset_choices_four_rows_saved_checked`, `summary_focus_form_has_no_settings_row`, `focus_window_fits_<size>_<state>` (generated).
- Notes: sonnet. By eye (owner): the Focus window at 1280×720 and on the second display, idle, running, paused and ended, light and dark. Break and warning cases move to E's last task (ruling 2: no such `Mode` yet).

### D7: The floater page and its keys
- Priority: 1
- Depends on: D4
- Owns:
  - `apps/orasenda/src/features/floater/{FloaterPage.tsx,main.tsx,floater.css,FloaterPage.test.tsx,FloaterPage.keys.test.tsx}`
  - `apps/orasenda/src-tauri/src/windows/floater.rs` (the key route and the monitor install) and `windows/floater_keys.rs` (new, if `floater.rs` would pass 300)
  - `verification/layout/floaterWindow.spec.ts` (new)
- Touches: `apps/orasenda/src/features/timer/useSurfaceTimer.ts`, `apps/orasenda/src/app/useTheme.ts` (consume), `crates/platform-macos/src/windows/keys.rs` (consume).
- Interfaces:
  - Consumes: `useSurfaceTimer`, `commands.{timerView,timerStart,timerPause,timerResume,settingsGet,nativeMenuPopup,focusViewClose,mainShow}` (D4); `floater_key`, `install_floater_key_monitor` (D3).
  - Produces: `const KEY_ROUTE: KeyRoute` (`Webview` or `Monitor`) in `windows/floater.rs`.
- Acceptance:
  - [ ] **Proof first, as code:** the PR opens with the proof's code path. With `KEY_ROUTE = Webview`, the page handles Space (pause, resume or start), Return (`main_show`) and Esc (`focus_view_close`). With `Monitor`, the D3 monitor consumes those three and ⇧⌘F, ⇧⌘T and ⌘K while the floater is key, and calls the same Rust paths; the page's handlers stay but never see the keys. A unit test covers each route. The owner's hands-on (H3, H4) chooses the route; flipping it is a one-line follow-up.
  - [ ] `FloatingTimer` gets the view's props, `ended`, `data-tauri-drag-region`; `onOpen` calls `main_show`; Start uses the saved preset with `custom: null`. No End anywhere.
  - [ ] The context menu (`contextmenu` → `native_menu_popup` in the floater) lists "Close floating timer", plus "Start focus" while idle or ended. If the popup can't show from the panel, the task drops it and records that on its issue.
  - [ ] Nothing gives the floater key focus on a tick, a milestone or a display change.
  - [ ] `floaterWindow.spec.ts`: 280×56, 280×64 and 360×96 × running, paused, deep, idle and ended, both themes and reduced motion: no scroll, everything inside the viewport, targets ≥ 44×44, the focus ring.
- Tests first: `floater_space_pauses_resumes_starts`, `floater_return_calls_main_show`, `floater_escape_closes`, `floater_never_calls_timer_state`, `floater_context_menu_items_per_state`, `key_route_monitor_consumes_six_keys`, `key_route_webview_installs_no_monitor`, `floater_window_fits_<size>_<state>` (generated).
- Notes: sonnet, opus review. By eye (owner): the floater at 280×56, 280×64 and 360×96, running, paused, idle and ended, on light, mid-grey and dark wallpapers, light and dark.

### D8: Today's Focus view button, Pages "Commands…", the ⌘K palette; close-out
- Priority: 1
- Depends on: D6 (`presetChoices`); D5 and D7 only so it lands last
- Owns:
  - `apps/orasenda/src/features/today/{FocusViewButton.tsx,FocusViewButton.test.tsx}` (new), `Today.tsx` (the button in `today-top-end`), `today.css` (that cell only), `statusLine.ts` and `statusLine.test.ts` (the failed-open line)
  - `apps/orasenda/src/app/PagesButton.tsx` and `PagesButton.test.tsx` ("Commands…" `Cmd+K` after the six pages)
  - `apps/orasenda/src/app/palette/{Palette.tsx,paletteCommands.ts,paletteCommands.test.ts,Palette.test.tsx}` (new)
  - `apps/orasenda/src/app/App.tsx` (mounts the palette on `palette-open` or Pages "Commands…") and `App.test.tsx`
  - `verification/layout/palette.spec.ts` (new); `verification/layout/today.fits.spec.ts` (only if the button needs a case)
  - close-out: `docs/DECISIONS.md` (ADR-016 accepted), `docs/specs/2026-11-12-focus-views.md` (status implemented, Implementation status), `docs/ROADMAP.md` (row D done), `CONTEXT.md` (check the spec's terms, add any missing)
- Touches: `apps/orasenda/src/features/today/presets.ts` (consume `presetChoices`), `apps/orasenda/src/features/settings/notificationsToggle.ts`, `apps/orasenda/src/ipc/settingsQueue.ts`, `apps/orasenda/src/app/useWindowLayout.ts` (consume).
- Interfaces:
  - Consumes: `commands.{displaysList,focusViewOpen,nativeMenuPopup}`, `events.paletteOpen` (D4); `presetChoices` (D6).
  - Produces: `paletteCommands(input: { view: TimerView | null; settings: Settings | null; lengths: PresetLength[]; displays: DisplayInfo[]; notifications: NotificationStatus }): Command[]`.
- Acceptance:
  - [ ] The "Focus view" `IconButton` (`expand`, `aria-haspopup="menu"`, `aria-expanded` while open) shows idle, running and paused, at every Today size, without moving another element; it is absent when `displays_list` answers `[]`.
  - [ ] Its menu: "Full screen" `Cmd+Shift+F` with one display, or "Full screen on <name>" per display (only the first carries `Cmd+Shift+F`), then "Floating timer, hide Orasenda" `Cmd+Shift+T`. A choice calls `focus_view_open`; a failure shows "The focus view didn't open." in the status row with a ghost "Try again" button that repeats the same open; the line ranks with the one-shot notices (newest wins) and clears on the next transition or a successful open (ruling 5); `null` does nothing.
  - [ ] No webview binding for ⌘⇧F, ⌘⇧T or ⌘K (`useShortcuts` has none); one `palette-open` mounts one palette.
  - [ ] The palette lists only what is available now, start first, Pause and End first while running, per the spec's table; each row runs the same command as its twin. `palette-open` while another modal is open only leaves the window forward.
  - [ ] Every Today harness case still passes; `palette.spec.ts`: the palette at 360×240 (compact) and 900×600, both themes, no document scroll, the focus ring.
  - [ ] ADR-016 reads accepted; the spec's status reads implemented with each task's PR; the roadmap row D reads done.
- Tests first: `focus_view_button_one_display_items`, `focus_view_button_several_displays_first_has_shortcut`, `focus_view_choice_calls_open`, `focus_view_button_hidden_without_displays`, `focus_view_open_failure_status_line`, `focus_view_try_again_repeats_open`, `focus_view_line_clears_on_transition`, `pages_commands_opens_palette`, `palette_open_event_mounts_once`, `palette_open_ignored_while_modal_open`, `palette_commands_idle_order`, `palette_commands_running_pause_end_first`, `palette_presets_exclude_selected`, `palette_theme_lists_two_not_current`, `no_webview_binding_for_focus_shortcuts`.
- Notes: sonnet. By eye (owner): Today with the button at 360×240, 900×600 and 1440×900; the palette regular and compact; light and dark. E adds "Set intent" to `paletteCommands` after D8 merges.

## Shared with E
E (Session cadence, spec PR #330, not yet merged) runs in parallel. The controller holds these rules:

| File | D task | Rule |
|---|---|---|
| `src-tauri/src/tray/menu.rs` → `tray/menu/*` and tray tests | D1 (move), D5 | D1 lands first; E's tray work rebases on it. D5 and E's tray task never run at the same time; the second rebases. |
| `features/today/Today.tsx`, `today.css`, `statusLine.ts` | D8 | D8 changes only `today-top-end` and adds one status line. D8 and E's Today task don't run at once; the second rebases. |
| `features/today/{presets.ts,PresetSummary.tsx}`, `crates/service/src/api/settings.rs` (read) | D6, D5 | D6 adds `presetChoices`; E's preset library keeps that signature behind it. |
| `crates/store/{migrations/,src/migrate.rs,src/lib.rs}` | D2 | Number assigned at landing: whichever of D2 and E's migration lands second renames its file, its `MIGRATIONS` entry and `SCHEMA_VERSION`. The `repo` re-export line is append-only. |
| `crates/service/src/api/*.rs` | none | D adds no API type there (frames live in `service/windows.rs`; `preset_select` reuses `TimerCommandError`). |
| `crates/service/src/session/{run.rs,service.rs,mod.rs}` | D2 | Append-only functions and one field; the second to land rebases. |
| `src-tauri/src/lib.rs`, `commands.list.rs`, `commands/mod.rs`, `ipc.rs`, `capabilities/main.json`, `lib_tests.rs` | D1, D4, D5 | Append-only registration lines; the controller resolves them at landing and keeps the capability tests' exact lists complete. |
| `src/ipc/bindings.ts` | D4 | Generated: regenerate after every rebase, never hand-merge. |
| `src/test/fixtures.ts`, `src/dev/layout/scenarios.ts` | D4 | Append-only; the controller resolves. D6 and D7 don't edit them. |
| ⌘K command list (`app/palette/paletteCommands.ts`) | D8 | E adds "Set intent" after D8 merges. |
| `features/focus/*`, `features/floater/*`, `verification/layout/{focusWindow,floaterWindow}.spec.ts` | D4, D6, D7 | E's last task (states and keys) starts after D6, D7 and D8 merge, and adds the break and warning harness cases D leaves out (ruling 2). |
| `CONTEXT.md`, `docs/DECISIONS.md` | D8 | Append at the end; E's ADRs are 017 onward. |
| `verification/contrast-pairs.json`, `packages/ui/src/designSystem.test.ts` (export count), `packages/ui/src/index.ts`, `packages/ui/src/types.ts` | none planned | Append-only conflicts; the controller resolves them if either side adds a component. |

## Rulings (controller, 2026-11-12)
1. The spec's Status reads `approved (owner, 2026-11-12)` from this plan's PR; D8 sets it to implemented.
2. D tests focus, paused, idle and ended (plus deep on the floater). Break and warning cases move to E's last task (Shared with E).
3. The Focus window shows the summary only idle or ended, as the READMEs say; `preset_select` keeps `wrongState` as a guard (D2, D6).
4. A failed `preset_select` save answers `TimerCommandError { kind: store }` (D2).
5. A failed open shows "The focus view didn't open." with a ghost "Try again" button that repeats the same open. It ranks with the one-shot notices (newest wins) and clears on the next transition or a successful open (D8).
6. `display_key` returns only `[A-Za-z0-9-]`, so `focus-<key>` is a valid label (D3, D4).
7. The pure clamp lives in `service/windows.rs`, the store calls in `session/frames.rs` (D2).
8. A frame whose write fails is kept in a `SessionService` field for this run (D2).
9. The floater's frame is read on `CloseRequested`, not `Destroyed` (D4).
10. Every open path hides `main`, including ⇧⌘T on an already-shown floater (D4).
11. D and E share one budget of three concurrent pipelines; the controller interleaves them.

## Hands-on checks (owner, at the end of D)
Two displays, "Displays have separate Spaces" on, then off. Implementers write the code path and test seam; the owner runs these.
- H1: Full screen on each display leaves the other usable; the menu bar and Dock stay drawn over the Focus window.
- H2: The floater over a full-screen app's Space and across Space switches; clicking it keeps the other app frontmost.
- H3: Space, Return and Esc on the floater while it is key and Orasenda is inactive (chooses D7's `KEY_ROUTE`).
- H4: ⇧⌘F, ⇧⌘T and ⌘K from `main`, a Focus window and the floater (Open question 1).
- H5: Unplugging the display under a Focus window, and under the floater.
- H6: The floater's frame per display after a relaunch; ⌘W on each window.
- H7: One ⌘K in `main` opens the palette exactly once (Open question 3).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: the Focus view button, every Today size, harness still passes | D8 |
| Goal 2: the button's menu items and order | D8 (items), D4 (`displays_list` order) |
| Goal 3: borderless Focus window, normal level, collection behaviour | D3, D4; H1 |
| Goal 4: insets, background, `FullScreenFocus` harness cases | D6 (break and warning: E's last task, ruling 2) |
| Goal 5: non-activating floater, key without activation, README sizes | D3, D4, D7; H2 |
| Goal 6: `window_frame`, no `change_log`, relaunch, clamp | D2, D4; H6 |
| Goal 7: ⇧⌘F, ⇧⌘T, ⌘K from every window | D5, D3 (fallback), D7; H4 |
| Goal 8: palette lists only available commands, same Rust paths | D8 |
| Goal 9: one HTML entry and capability file per window, exact tests | D4 |
| Goal 10: ≤ 500 lines, tokens, both themes, focus ring | D1, every UI task |
| Commands, events, `native_menu_popup` change | D4 |
| `timer_view` without draining; `preset_select` refusal | D2, D4 |
| Focus menu and tray items; tray presets from `preset_lengths()` | D5 |
| Display changes | D5 |
| Lifecycle: close, hide `main`, Dock leaves the floater | D4 |
| ADR-016 accepted, CONTEXT terms | D8 |
| Failure mode: a display key that isn't a valid window label | D3: `display_key_is_label_safe`; D4: `focus_label_is_valid_for_any_display_id` |
| Failure mode: a start lands between `preset_select`'s check and its save | D2: `select_preset_refused_when_start_wins_race` |
| Failure mode: the chosen display disconnects between the list and the open | D4: `focus_view_open_unknown_display_is_no_display` |
| Failure mode: the store is down when the floater's frame is written | D2: `frame_save_store_down_kept_in_memory` |
| Failure mode: ⌘K while another modal is open in `main` | D8: `palette_open_ignored_while_modal_open` |
