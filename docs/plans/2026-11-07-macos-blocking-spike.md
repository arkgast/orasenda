# macOS detection-and-overlay spike — Implementation Plan

- Spec: [docs/specs/2026-11-07-macos-blocking-spike.md](../specs/2026-11-07-macos-blocking-spike.md)
- Date: 2026-11-07
- Status: in backlog (#12–#20)

## Overview
Nine tasks. S1 (the `IntentPrompt` change, design-first) has no dependency and can start now.
Everything else builds on the app shell:
- core logic (S2) needs the core crate (#6);
- the macOS platform crate is split into app/idle/foreground access (S3a) and overlay window
  control (S3b), both implementing or extending S2's traits;
- the `packages/ui` wrapper (S4) needs S1's refreshed bundle and the test stack from #8;
- the app crate gets the cross-platform commands, state and capabilities first (S5a, needs S2
  and #8), then the macOS wiring and spike bundle (S5b, needs S3a, S3b and S5a);
- the overlay page and dev panel (S6) need S4, S5a and the shell UI (#9), so they run in parallel
  with S3a/S3b/S5b;
- S7 (manual, on real hardware) runs the matrix, writes the findings and accepts ADR-004/005.

Cut along crate, module and package boundaries.

**Conventions for every task:** structs and enums that cross IPC use `#[serde(rename_all =
"camelCase")]` (TypeScript sees `bundleId`, `startMs`, `appName`); enum variants are lowercase.
Green CI means `gh pr checks <pr> --required` passes; a red `windows (advisory)` is reported, not
fixed. Lockfiles are regenerated after a rebase, never hand-merged. Tasks that add lines to
`justfile` (S2, S4) rebase on whichever landed first.

## Contract
- **Core types and traits (S2):** `AppRef`, `BlockAction`, `BlockRule`, `Decision`, `decide`,
  `Gate`, `GateAction`, `UsageSegment`, `UsageTracker`, `ForegroundSource`, `AppControl`,
  `IdleSource`, `PlatformError`. S3a implements the traits; S5a/S5b consume everything.
- **IPC (S5a):** the spike commands and events, exported to `apps/orasenda/src/bindings.ts`. S6
  builds against `bindings.ts` with `mockIPC`.
- **Component contract (S1 → S4 → S6):** `IntentPrompt` without `onWait` renders no Wait button.

## Impact
Shared modules: `crates/core` (new public modules), `bindings.ts`, the `justfile` `ci` recipe,
root `Cargo.toml`, and the design system.
- **Affected consumers:** the shell's `app_info` and `clock-tick` are untouched. `bindings.ts`
  grows (new commands and types); the shell UI only imports what it uses.
- **Data and migrations:** none.
- **Checks that must stay green:** the core boundary step (extended to reject `objc2`), core
  mobile `cargo check` (new core modules must stay pure), bindings staleness on macOS and
  Windows (spike commands exist on every OS), the Windows advisory job (platform crate and its
  dependencies are macOS-only target dependencies), the shell's Vitest suite.
- **Rollout and rollback:** everything is inert unless `ORASENDA_SPIKE=1` in a debug build.
  Each task is one squash-merged PR; revert it to roll back. S1's design-system change is
  reverted by republishing the previous artifact version and refreshing `design/system/`.

## Dependency graph
```
S1 ───────────────────────> S4 ─────────┐
#8 ───────────────────────> S4          │
#6 ──> S2 ──> S3a ──> S3b ──> S5b ──┐   │
        S2 ──> S5a ──> S5b          ├──> S7
        #8 ──> S5a ──> S6 <── S4 ───┘
               #9 ──> S6 ──────────────> S7
```
- S3a: S2. S3b: S3a. S4: S1, #8. S5a: S2, #8. S5b: S3b, S5a. S6: S4, S5a, #9. S7: S5b, S6.
- Can start immediately: **S1**. After #6: S2. After S2: S3a (and S5a once #8 is in).

## Tasks

### S1: IntentPrompt shows Wait only when `onWait` is passed  (#12)
- Priority: 0
- Depends on: none
- Owns: `design/system/**`
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `IntentPrompt` (design system) — with `onWait` undefined, no "Wait 10 minutes, then decide" button is rendered; with `onWait` set, behavior unchanged. `IntentPromptProps` unchanged.
- Acceptance:
  - [ ] The live design system artifact (https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73) is updated first ("update the Orasenda design system"): `IntentPrompt` renders the Wait button only when `onWait` is passed, like `onContinue`; its README says so.
  - [ ] `design/system/` is refreshed from the republished artifact in the same PR; the diff is the `IntentPrompt` change (code, README, bundle) plus any mechanical bundle noise, explained.
  - [ ] In `bundle.js`, the Wait button is conditional on `p.onWait`.
  - [ ] PR `ci` is green (`gh pr checks <pr> --required`).
- Tests first: none automated (the design system has no test suite). The PR shows the artifact's IntentPrompt preview with and without `onWait`, in light and dark.
- Notes: CLAUDE.md "Keeping the design system in sync" applies: artifact first, then the repo copy; never edit `design/system/` by hand alone. The builder must be a Claude session with the Artifact tool: `read` the artifact URL, change only `IntentPrompt`, publish to the same URL, then refresh `design/system/` from the published files (`read` with `paths`). If republishing reformats `bundle.js` beyond the change, keep it and explain the noise in the PR.

### S2: Core blocking, usage and platform traits  (#19)
- Priority: 0
- Depends on: #6
- Owns: `crates/core/src/blocking.rs`, `crates/core/src/usage.rs`, `crates/core/src/platform.rs`
- Touches (read-only or additive): `crates/core/src/lib.rs` (adds `pub mod` lines and re-exports), `justfile` (boundary step also rejects lines starting with `objc2`, `block2`, `windows`)
- Interfaces:
  - Consumes: `orasenda-core` crate and `just ci` (#6)
  - Produces:
    - `AppRef { bundle_id: Option<String>, name: String, pid: i32 }` (serde, `specta::Type`)
    - `BlockAction { Hide, Close }` (lowercase), `BlockRule { targets: BTreeSet<String>, action: BlockAction }` + `Default`
    - `Decision { Allow, Intercept }`; `SAFETY_ALLOWLIST: &[&str]`
    - `decide(app: &AppRef, rule: &BlockRule, own_bundle_id: &str, extra_allow: &[String]) -> Decision`
    - `GateAction { Show, Ignore, CloseOverlay }`; `Gate::new(own_bundle_id: String)`, `Gate::on_foreground(&mut self, app: &AppRef, decision: Decision) -> GateAction`, `Gate::allow(&mut self, bundle_id: &str)`, `Gate::overlay_open(&mut self, bundle_id: &str)`, `Gate::overlay_closed(&mut self)`
    - `UsageSegment { bundle_id: Option<String>, name: String, start_ms: u64, end_ms: Option<u64> }`; `IDLE_THRESHOLD_MS: u64 = 120_000`; `UsageTracker::new(idle_threshold_ms: u64)`, `on_foreground(&mut self, app: &AppRef, at_ms: u64)`, `on_idle_sample(&mut self, idle_ms: u64, at_ms: u64)`, `segments(&self) -> &[UsageSegment]` (cap 500)
    - `trait ForegroundSource`, `trait AppControl` (incl. `activate`), `trait IdleSource`, `enum PlatformError { Unsupported, NotFound, Refused, Other(String) }` — signatures exactly as in the spec's Domain model
- Acceptance:
  - [ ] All spec Domain-model rules for `decide`, `Gate` and `UsageTracker` hold (tests below).
  - [ ] Core still has no `cfg(target_os)`, no `SystemTime::now()`, no new dependency; core mobile `cargo check` passes.
  - [ ] Adding `objc2` to core in a scratch commit fails the boundary step (checked by hand, noted in the PR).
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first:
  - `decide_target_intercepts`, `decide_non_target_allows`, `decide_allowlist_never_intercepts` (each entry), `decide_own_bundle_allows`, `decide_missing_bundle_allows`, `decide_extra_allow_allows`, `decide_empty_rule_allows`
  - `gate_continue_suppresses_same_app`, `gate_other_countable_app_resets_allowance`, `gate_self_allowlisted_or_unbundled_do_not_reset`, `gate_open_overlay_ignores_repeat`, `gate_countable_app_while_open_closes_overlay`, `gate_overlay_closed_reenables`
  - `tracker_switch_closes_and_opens`, `tracker_idle_closes_at_idle_start`, `tracker_activity_after_idle_reopens`, `tracker_idle_below_threshold_noop`, `tracker_out_of_order_clamped`, `tracker_caps_at_500`
  - `block_action_serializes_lowercase`, `app_ref_serializes_camel_case`, `usage_segment_exports_numbers_as_f64` (exports the type with `specta_typescript` in a dev-only test, or asserts the attribute via `specta::Type` datatype)
- Notes: `serde_json` is already a dev-dependency (#6). `start_ms` and `end_ms` carry `#[specta(type = f64)]`
  (specta refuses to export `u64` by default; epoch ms ≪ 2^53, so this is lossless); `pid` is `i32`.
  All IPC types use `rename_all = "camelCase"`.

### S3a: `crates/platform-macos`: apps, foreground and idle  (#13)
- Priority: 0
- Depends on: S2
- Owns: `crates/platform-macos/Cargo.toml`, `crates/platform-macos/src/{lib.rs, foreground.rs, control.rs, idle.rs}`
- Touches (read-only or additive): `Cargo.toml` (adds `[workspace.dependencies]` pins for objc2, objc2-foundation, objc2-app-kit, objc2-core-graphics, block2), `Cargo.lock`
- Interfaces:
  - Consumes: `ForegroundSource`, `AppControl`, `IdleSource`, `AppRef`, `PlatformError` from `crates/core` (S2)
  - Produces (crate `orasenda-platform-macos`, empty on non-macOS):
    - `MacForeground::new() -> MacForeground` implementing `ForegroundSource`; `MacForeground::subscribe_terminations(&self, sink: Box<dyn Fn(i32) + Send + Sync>) -> Result<(), PlatformError>` (pid of a quit app)
    - `MacAppControl` implementing `AppControl` (regular apps only; cooperative activation on 14+, `activateWithOptions` on 13)
    - `MacIdle` implementing `IdleSource`
    - `phone_bundle_id() -> Option<String>` — reads `CFBundleIdentifier` from `/System/Applications/Phone.app/Contents/Info.plist`; `None` when absent
- Acceptance:
  - [ ] objc2-family dependencies are declared under `[target.'cfg(target_os = "macos")'.dependencies]` with only the Cargo features for classes used.
  - [ ] Observer registration requires `MainThreadMarker`; `NSWorkspace.runningApplications` and `NSRunningApplication` calls do not.
  - [ ] `cargo tree -p orasenda-core` unchanged; the Windows advisory job's result is no worse than on `main`.
  - [ ] `./scripts/ci.sh` passes on macOS; `gh pr checks <pr> --required` passes.
- Tests first (macOS only): `idle_ms_is_available`, `running_apps_contains_regular_apps`, `running_apps_runs_off_main_thread`, `subscribe_off_main_thread_errors`, `hide_unknown_pid_is_not_found`, `phone_bundle_id_missing_file_is_none` (reads from a path parameter in a private helper), `frontmost_returns_some` (`#[ignore]`, manual)
- Notes: run `baton:deps` for each crate (spec table: objc2 0.6.5, objc2-foundation/app-kit/core-graphics 0.3.2, block2 0.6.2), matched to the versions in `cargo tree -p orasenda` so no second copy appears. `unsafe` blocks get a `// SAFETY:` comment. Never use `forceTerminate`.

### S3b: `crates/platform-macos`: overlay window control  (#20)
- Priority: 0
- Depends on: S3a
- Owns: `crates/platform-macos/src/overlay.rs`
- Touches (read-only or additive): `crates/platform-macos/src/lib.rs` (adds `mod overlay` and re-exports), `crates/platform-macos/Cargo.toml` (extra objc2-app-kit features only)
- Interfaces:
  - Consumes: `PlatformError` from `crates/core` (S2); the crate from S3a
  - Produces: `enum OverlayStrategy { LevelAndCollection, NonActivatingPanel, AccessoryPolicy }`; `configure_overlay(ns_window: *mut c_void, strategy: OverlayStrategy) -> Result<(), PlatformError>`; `cover_main_screen(ns_window: *mut c_void) -> Result<(), PlatformError>`; `focus_overlay(ns_window: *mut c_void) -> Result<(), PlatformError>`; `restore_activation_policy() -> Result<(), PlatformError>`
- Acceptance:
  - [ ] Every function requires the main thread (`MainThreadMarker::new()` → `Other("not on main thread")` otherwise).
  - [ ] `LevelAndCollection`: level `NSScreenSaverWindowLevel`, collection behavior `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`.
  - [ ] `NonActivatingPanel`: a `define_class!` `NSPanel` subclass overriding `canBecomeKeyWindow` → YES, swapped in with `object_setClass`, plus the `nonactivatingPanel` style mask.
  - [ ] `AccessoryPolicy`: `.accessory` while shown; `restore_activation_policy` sets `.regular`.
  - [ ] `cover_main_screen` sets the frame natively from `NSScreen::mainScreen`; `focus_overlay` uses cooperative activation on 14+ and `activateIgnoringOtherApps` on 13.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first (macOS only): `configure_overlay_off_main_thread_errors`, `cover_main_screen_off_main_thread_errors`, `focus_overlay_off_main_thread_errors`. Behavior over full-screen apps is proven by S7, not by unit tests.
- Notes: keep each strategy in its own function so S7 can compare them; document in comments what each changes on the `NSWindow`.

### S4: `packages/ui` wrapper  (#14)
- Priority: 0
- Depends on: S1, #8
- Owns: `packages/ui/**`
- Touches (read-only or additive): `design/system/components/bundle.js`, `bundle.css`, `index.d.ts` (read), `justfile` (adds the `ui-css` recipe, a staleness step and `pnpm --filter @orasenda/ui test` after the tokens steps), `biome.json` (ignores `packages/ui/components.css`), `pnpm-lock.yaml` (regenerated, never hand-merged)
- Interfaces:
  - Consumes: the refreshed design system bundle (S1)
  - Produces: package `@orasenda/ui` — `import "@orasenda/ui"` gives named exports `IntentPrompt`, `Button` (and the rest of the `window.Orasenda` namespace) typed from `index.d.ts`; `@orasenda/ui/components.css` (bundle.css without its font `@import`); `just ui-css`
- Acceptance:
  - [ ] `react-global.ts` sets `window.React` and is imported before `bundle.js` (ES import hoisting); a test imports `@orasenda/ui` and renders `IntentPrompt` without `window.React` being undefined.
  - [ ] `components.css` has no `@import` and no URL; regenerating it gives an identical file, and `just ci` fails when it is stale.
  - [ ] `react` is a peer dependency and a dev dependency at the app's version (no second copy in `pnpm why react`).
  - [ ] `just ci` runs the package's tests and fails when one fails.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: `exports_intent_prompt_and_button`, `intent_prompt_renders_with_global_react`, `intent_prompt_without_on_wait_has_no_wait_button`, `components_css_has_no_import_or_url`, `components_css_is_deterministic`
- Notes: tests run with Vitest + jsdom + Testing Library from #8 (dev dependencies of this package, same versions). Polyfill `HTMLDialogElement.showModal/close` in the test setup if jsdom lacks it.

### S5a: Spike commands, state and capabilities (every OS)  (#15)
- Priority: 0
- Depends on: S2, #8
- Owns: `apps/orasenda/src-tauri/src/spike/{mod.rs, commands.rs, state.rs}`, `apps/orasenda/src-tauri/capabilities/overlay.json`
- Touches (read-only or additive): `src-tauri/src/lib.rs` (registers the spike commands/events in `specta_builder()`, manages `SpikeState`, calls `spike::setup` in `setup()`), `src-tauri/commands.list.rs` (adds the six spike commands), `capabilities/main.json` (adds the four `main` spike permissions), `apps/orasenda/src/bindings.ts` (regenerated)
- Interfaces:
  - Consumes: everything S2 produces; `specta_builder()`, `COMMANDS` from the app crate (#8)
  - Produces:
    - `spike::enabled() -> bool`; `spike::setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>>` (no-op when disabled or not macOS; S5b fills the macOS branch)
    - `SpikeState { rule: BlockRule, gate: Gate, tracker: UsageTracker, target: Option<AppRef>, previous: Option<AppRef>, pending_show: Option<OverlayShow>, extra_allow: Vec<String> }` in one `Mutex`
    - commands `spike_status() -> SpikeStatus { enabled: bool, platform_supported: bool }`, `spike_running_apps() -> Result<Vec<AppRef>, SpikeError>`, `spike_set_rule(rule: BlockRule) -> Result<(), SpikeError>`, `spike_usage() -> Result<Vec<UsageSegment>, SpikeError>`, `spike_overlay_ready() -> Result<(), SpikeError>`, `spike_overlay_choice(choice: OverlayChoice) -> Result<(), SpikeError>`
    - `SpikeError { Disabled, Unsupported, Platform(String) }` as `{ kind, message }` (`Disabled` wins over `Unsupported`); `OverlayChoice = { kind: "return" } | { kind: "continue", reason: string | null }`
    - events `overlay-show` (`OverlayShow { appName }`), `spike-usage-changed`
    - `trait SpikePlatform` (in `spike/mod.rs`) with the side effects S5b provides on macOS: `running_apps`, `hide_or_close(pid, action)`, `activate(pid)`, `show_overlay(show: OverlayShow)`, `hide_overlay()`, `show_main()`; on other OS or when disabled, no implementation is installed
    - TS (generated): `commands.spikeStatus()`, `commands.spikeRunningApps()`, `commands.spikeSetRule(rule)`, `commands.spikeUsage()`, `commands.spikeOverlayReady()`, `commands.spikeOverlayChoice(choice)`, `events.overlayShow`, `events.spikeUsageChanged`
- Acceptance:
  - [ ] All commands exist on every OS; `bindings.ts` regenerated on the Windows job is identical (its staleness step passes there, or the advisory failure is unrelated and reported).
  - [ ] Flag off: commands other than `spike_status` return `Disabled`; `spike::setup` starts nothing.
  - [ ] `spike_overlay_choice` logic lives here, against `SpikePlatform`: `return` → `hide_or_close` the target, `hide_overlay`, `Gate::overlay_closed`, then `activate(previous)` if it is running else `show_main`; `continue` → `Gate::allow`, `hide_overlay`, `Gate::overlay_closed`, `activate(target)`; the reason is logged, never stored.
  - [ ] `spike_running_apps` returns regular apps sorted by name, excluding Orasenda and the safety allowlist (filtering in core-side logic, testable with the fake).
  - [ ] `spike_overlay_ready` re-emits a pending `OverlayShow`.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first (with a fake `SpikePlatform`): `spike_disabled_without_flag`, `disabled_wins_over_unsupported`, `overlay_capability_grants_only_overlay_choice`, `main_capability_includes_spike_commands`, `manifest_commands_match_specta_builder` (existing, now with spike commands), `overlay_choice_serializes_tagged`, `spike_error_serializes_kind_message`, `return_hides_target_then_activates_previous`, `return_without_running_previous_shows_main`, `running_apps_sorted_and_filtered`, `continue_allows_and_activates_target`, `ready_reemits_pending_show`
- Notes: commands are synchronous; anything that touches AppKit goes through `SpikePlatform`, whose macOS implementation (S5b) uses `run_on_main_thread`. Never hold the `SpikeState` lock while calling `SpikePlatform`.

### S5b: macOS spike wiring and spike bundle  (#16)
- Priority: 0
- Depends on: S3b, S5a
- Owns: `apps/orasenda/src-tauri/src/spike/{macos.rs, overlay.rs}`, `apps/orasenda/src-tauri/tauri.spike.conf.json`
- Touches (read-only or additive): `apps/orasenda/src-tauri/Cargo.toml` (adds `orasenda-platform-macos` under `[target.'cfg(target_os = "macos")'.dependencies]`), `src-tauri/src/spike/mod.rs` (fills the macOS branch of `setup`)
- Interfaces:
  - Consumes: `MacForeground` (incl. `subscribe_terminations`), `MacAppControl`, `MacIdle`, `phone_bundle_id` (S3a); `OverlayStrategy`, `configure_overlay`, `cover_main_screen`, `focus_overlay`, `restore_activation_policy` (S3b); `SpikeState`, `SpikePlatform`, `spike::setup`, `OverlayShow` (S5a)
  - Produces: `MacSpikePlatform` implementing `SpikePlatform`; `const OVERLAY_STRATEGY: OverlayStrategy` in `spike/overlay.rs`
- Acceptance:
  - [ ] Setup (flag on, macOS): hidden opaque `overlay` window loading `overlay.html` (no decorations, not resizable, always on top, skip taskbar, visible on all workspaces) configured with `OVERLAY_STRATEGY` (`LevelAndCollection` first); `extra_allow` filled from `phone_bundle_id()`.
  - [ ] Foreground sink: record arrival `Instant`, `UsageTracker::on_foreground`, remember `previous` (last countable app before a target), `decide`, `Gate::on_foreground`; on `Show`: `cover_main_screen`, emit `overlay-show` to `overlay` (or keep it pending until ready), `show`, `focus_overlay`, log `spike: overlay <ms> ms`; on `CloseOverlay`: hide the overlay and `Gate::overlay_closed`.
  - [ ] Termination sink: when the target's pid quits while the overlay is open, hide it and `Gate::overlay_closed`.
  - [ ] Thread `spike-idle`: every 5 s `MacIdle::idle_ms()` → `on_idle_sample`. `spike-usage-changed` is emitted to `main` at most once per second (coalesced).
  - [ ] All window work runs via `run_on_main_thread`; no lock held across it.
  - [ ] `tauri.spike.conf.json` sets `bundle.macOS.signingIdentity` `"-"` and `hardenedRuntime` `true`; `pnpm --filter orasenda tauri build --debug --bundles app --config src-tauri/tauri.spike.conf.json` produces `Orasenda.app`, and `open --env ORASENDA_SPIKE=1 --stderr /tmp/orasenda-spike.log …/Orasenda.app` launches it with the flag on (checked by hand, noted in the PR).
  - [ ] `just ci` passes, including the debug no-bundle build; `gh pr checks <pr> --required` passes.
- Tests first: `usage_changed_is_coalesced_to_one_per_second` (the coalescer is a pure helper taking `Instant`s), `previous_skips_self_allowlisted_and_unbundled` (pure helper). The rest is proven by S7's matrix.
- Notes: the strategy is a single `const` so S7 can switch it in one line.

### S6: Overlay page and dev panel  (#17)
- Priority: 0
- Depends on: S4, S5a, #9
- Owns: `apps/orasenda/overlay.html`, `apps/orasenda/src/overlay.tsx`, `apps/orasenda/src/overlay.test.tsx`, `apps/orasenda/src/spike/**`
- Touches (read-only or additive): `apps/orasenda/vite.config.ts` (adds `overlay.html` to `build.rolldownOptions.input`), `apps/orasenda/src/App.tsx` (renders `<DevPanel />` when `spike_status().enabled`), `apps/orasenda/package.json` (adds `"@orasenda/ui": "workspace:*"`), `apps/orasenda/src/test/setup.ts` (dialog polyfill if needed), `pnpm-lock.yaml`
- Interfaces:
  - Consumes: the generated spike commands and events from `bindings.ts` (S5a); `IntentPrompt`, `Button`, `components.css` from `@orasenda/ui` (S4); `tokens.css` (#7); `App.tsx` (#9)
  - Produces: `useSpike(): { status: SpikeStatus | null; apps: AppRef[]; rule: BlockRule; usage: UsageSegment[]; setRule(rule: BlockRule): Promise<void>; refreshApps(): Promise<void> }`; `<DevPanel />`; the overlay page
- Acceptance:
  - [ ] `overlay.html` sits next to `index.html`; `build.rolldownOptions.input` lists **both** `index.html` and `overlay.html` as absolute paths (setting `input` replaces the default entry); the debug build serves `/index.html` and `/overlay.html`.
  - [ ] Overlay: opaque `surface` background; `IntentPrompt` keyed per show, no `onWait`, `app` = `appName`; calls `spike_overlay_ready` once mounted; `undefined` reason sent as `null`.
  - [ ] Dev panel: rendered only when enabled; "Apps to intercept" checkboxes and "When I go back to focus" radios (*Hide the app* / *Quit the app*) use `.os-choice-group` / `.os-choice`; "Refresh apps" is the design system `Button`; usage list shows "name · start–end", "now" for the open segment, and idle gaps; times formatted like the shell clock.
  - [ ] No hex, px or font names in new CSS; both themes checked; keyboard and VoiceOver checked on the panel and the overlay.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: `overlay_renders_nothing_before_show`, `overlay_calls_ready_on_mount`, `overlay_shows_app_name`, `overlay_return_and_escape_send_return`, `overlay_continue_sends_reason_or_null`, `overlay_second_show_resets_reason`, `dev_panel_hidden_when_disabled`, `dev_panel_check_sets_rule`, `dev_panel_action_radio_sets_rule`, `dev_panel_open_segment_shows_now`, `dev_panel_shows_idle_gap_rows`, `use_spike_refetches_usage_on_event`

### S7: Run the matrix, write the findings, accept ADR-004/005 (manual, real hardware)  (#18)
- Priority: 0
- Depends on: S5b, S6
- Owns: `docs/spikes/2026-11-07-macos-blocking.md`, `docs/DECISIONS.md` (ADR-004, ADR-005 entries and the Pending section)
- Touches (read-only or additive): `apps/orasenda/src-tauri/src/spike/overlay.rs` (only the strategy `const`, if a fallback wins), `docs/specs/2026-11-07-macos-blocking-spike.md` (Implementation status only), `docs/ROADMAP.md` (P0 spike line, if wording needs the result)
- Interfaces:
  - Consumes: the running spike (S5b, S6)
  - Produces: none (docs and decisions)
- Acceptance:
  - [ ] The findings doc fills every matrix row (1–12, incl. 2b and 4b) for `tauri dev` and for the Launch-Services-launched spike bundle, with macOS version, hardware, the 10 timing samples per case, CPU average, the Privacy & Security observations, and which overlay strategy won.
  - [ ] If no strategy rises above full-screen apps, the findings say so and ADR-004 is accepted with "native AppKit overlay required" and a follow-up spec named; otherwise ADR-004 is accepted with the winning strategy.
  - [ ] ADR-004 and ADR-005 move to *accepted*, citing the findings; Close-mode results decide whether Close stays; the anti-quit helper stays an open follow-up; the Pending section is updated.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: none (manual matrix). Any bug found while running it goes through `baton:debug` and gets a regression test in the owning crate's task area via its own issue.
- Notes: needs a human on a Mac with a second display, Stage Manager and full-screen Spaces; likely more than 4 h. It may be split into a "matrix run + findings" PR and an "accept ADRs" PR. Record the Phone app's bundle ID (read at runtime by S3a/S5b) in the findings.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: detection for every switching method | S3a (observer), S5b (sink), S7 (matrix row 1) |
| Goal 2: no TCC prompt, Launch Services bundle evidence | S5b (`tauri.spike.conf.json`, launch), S7 (row 6) |
| Goal 3: overlay above target ≤ 500 ms, key, no Space switch, VoiceOver | S3b (strategies, focus), S5b (timing log), S6 (UI), S7 (rows 2, 2b, 7) |
| Goal 4: Back to focus / Continue / allowlist / self / Phone app | S2 (`decide`, `Gate`), S3a (`phone_bundle_id`), S5a (choice handling), S6, S7 (rows 3–5, 4b) |
| Goal 5: usage segments and idle | S2 (tracker), S3a (`MacIdle`), S5b (idle thread, coalesced event), S6 (list), S7 (row 8) |
| Goal 6: CPU < 1 %, no polling | S3a (notifications), S7 (row 9) |
| Goal 7: dev-only | S5a (`spike_disabled_without_flag`), S6 (`dev_panel_hidden_when_disabled`), S7 (row 10) |
| Goal 8: boundaries, Windows job | S2 (boundary step), S3a (target deps), S5a (bindings on every OS), S5b (target dep) |
| Goal 9: findings and ADRs | S7 |
| Permissions: per-window capabilities, AppManifest | S5a |
| Overlay UI without Wait | S1, S4, S6 |
| `packages/ui` load order, components.css | S4 |
| Threading rules | S3a, S3b, S5a, S5b |
| Edge cases: quit target, other app while open, rule change, refused hide/terminate | S2 (`gate_countable_app_while_open_closes_overlay`), S5b (`CloseOverlay`, termination sink), S7 (row 12) |
| Conventions additions | already in `docs/conventions.md` (merged with the spec) |
| Failure mode: overlay page not yet listening on first show | S6: `overlay_calls_ready_on_mount`; S5a: `ready_reemits_pending_show` |
| Failure mode: `u64` fields rejected by the bindings export | S2: `usage_segment_exports_numbers_as_f64` |
| Failure mode: `hide` on a pid that no longer exists | S3a: `hide_unknown_pid_is_not_found` |
| Failure mode: reason group carries over between shows | S6: `overlay_second_show_resets_reason` |
| Failure mode: `NSRunningApplication` called from a test thread | S3a: `running_apps_runs_off_main_thread` |
