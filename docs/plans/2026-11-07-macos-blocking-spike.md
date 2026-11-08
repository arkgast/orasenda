# macOS detection-and-overlay spike — Implementation Plan

- Spec: [docs/specs/2026-11-07-macos-blocking-spike.md](../specs/2026-11-07-macos-blocking-spike.md)
- Date: 2026-11-07
- Status: draft

## Overview
Seven tasks. S1 (the `IntentPrompt` change, design-first) has no dependency and can start now.
Everything else builds on the app shell: core logic (S2) needs the core crate (#6); the macOS
platform crate (S3) implements S2's traits; the `packages/ui` wrapper (S4) needs S1's refreshed
bundle; the app-crate wiring (S5) needs S2, S3 and the Tauri app (#8); the overlay page and dev
panel (S6) need S4, S5 and the shell UI (#9). S7 runs the manual matrix, writes the findings and
accepts ADR-004/005.

Cut along crate and package boundaries so S2/S4 and S3/S4 run in parallel without sharing files.

## Contract
- **Core types and traits (S2):** `AppRef`, `BlockAction`, `BlockRule`, `Decision`, `decide`,
  `Gate`, `GateAction`, `UsageSegment`, `UsageTracker`, `ForegroundSource`, `AppControl`,
  `IdleSource`, `PlatformError`. S3 implements the traits; S5 consumes everything.
- **IPC (S5):** the spike commands and events, exported to `apps/orasenda/src/bindings.ts`. S6
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
S1 ─────────────────> S4 ──┐
#6 ──> S2 ──> S3 ──> S5 ──┼──> S6 ──> S7
#6 ──────────> S4    #8 ──┘    #9 ──┘
```
- S5 depends on S2, S3, #8. S6 depends on S4, S5, #9. S7 depends on S6.
- Can start immediately: **S1**. After #6: S2 (and S4 once S1 is in). After S2: S3.

## Tasks

### S1: IntentPrompt shows Wait only when `onWait` is passed
- Priority: 0
- Depends on: none
- Owns: `design/system/**`
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `IntentPrompt` (design system) — with `onWait` undefined, no "Wait 10 minutes, then decide" button is rendered; with `onWait` set, behavior unchanged. `IntentPromptProps` unchanged.
- Acceptance:
  - [ ] The live design system artifact (https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73) is updated first ("update the Orasenda design system"): `IntentPrompt` renders the Wait button only when `onWait` is passed, like `onContinue`; its README says so.
  - [ ] `design/system/` is refreshed from the republished artifact in the same PR; `git diff` shows only the `IntentPrompt` change (code, README, bundle) and nothing else.
  - [ ] In `bundle.js`, the Wait button is conditional on `p.onWait`.
  - [ ] PR `ci` is green (`gh pr checks <pr> --required`).
- Tests first: none automated (the design system has no test suite). The PR shows the artifact's IntentPrompt preview with and without `onWait`, in light and dark.
- Notes: CLAUDE.md "Keeping the design system in sync" applies: artifact first, then the repo copy; never edit `design/system/` by hand alone.

### S2: Core blocking, usage and platform traits
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
  - `block_action_serializes_lowercase`, `app_ref_roundtrip`
- Notes: `serde_json` is already a dev-dependency (#6). No `specta` attributes beyond `specta::Type` derives.

### S3: `crates/platform-macos`
- Priority: 0
- Depends on: S2
- Owns: `crates/platform-macos/**`
- Touches (read-only or additive): `Cargo.toml` (adds `[workspace.dependencies]` pins for objc2, objc2-foundation, objc2-app-kit, objc2-core-graphics, block2), `Cargo.lock`
- Interfaces:
  - Consumes: `ForegroundSource`, `AppControl`, `IdleSource`, `AppRef`, `PlatformError` from `crates/core` (S2)
  - Produces (crate `orasenda-platform-macos`, empty on non-macOS):
    - `MacForeground::new() -> MacForeground` implementing `ForegroundSource`; `MacForeground::subscribe_terminations(&self, sink: Box<dyn Fn(i32) + Send + Sync>) -> Result<(), PlatformError>` (pid of a quit app)
    - `MacAppControl` implementing `AppControl` (regular apps only; cooperative activation on 14+, `activateWithOptions` on 13)
    - `MacIdle` implementing `IdleSource`
    - `enum OverlayStrategy { LevelAndCollection, NonActivatingPanel, AccessoryPolicy }`
    - `configure_overlay(ns_window: *mut c_void, strategy: OverlayStrategy) -> Result<(), PlatformError>`, `cover_main_screen(ns_window: *mut c_void) -> Result<(), PlatformError>`, `focus_overlay(ns_window: *mut c_void) -> Result<(), PlatformError>`, `restore_activation_policy() -> Result<(), PlatformError>`
- Acceptance:
  - [ ] objc2-family dependencies are declared under `[target.'cfg(target_os = "macos")'.dependencies]` with only the Cargo features for classes used.
  - [ ] Window/app/screen calls and observer registration require `MainThreadMarker`; `NSWorkspace`/`NSRunningApplication` calls do not.
  - [ ] The `NonActivatingPanel` strategy uses a `define_class!` `NSPanel` subclass overriding `canBecomeKeyWindow` → YES, swapped in with `object_setClass`, plus the `nonactivatingPanel` style mask.
  - [ ] `cargo tree -p orasenda-core` unchanged; the Windows advisory job's result is no worse than on `main`.
  - [ ] `./scripts/ci.sh` passes on macOS; `gh pr checks <pr> --required` passes.
- Tests first (macOS only): `idle_ms_is_available`, `running_apps_contains_regular_apps`, `running_apps_runs_off_main_thread`, `subscribe_off_main_thread_errors`, `hide_unknown_pid_is_not_found`, `frontmost_returns_some` (`#[ignore]`, manual)
- Notes: run `baton:deps` for each crate (spec table: objc2 0.6.5, objc2-foundation/app-kit/core-graphics 0.3.2, block2 0.6.2), matched to the versions in `cargo tree -p orasenda` so no second copy appears. `unsafe` blocks get a `// SAFETY:` comment. Never use `forceTerminate`.

### S4: `packages/ui` wrapper
- Priority: 0
- Depends on: S1, #6
- Owns: `packages/ui/**`
- Touches (read-only or additive): `design/system/components/bundle.js`, `bundle.css`, `index.d.ts` (read), `justfile` (adds the `ui-css` recipe and a staleness step after the tokens steps), `biome.json` (ignores `packages/ui/components.css`), `pnpm-lock.yaml` (regenerated, never hand-merged)
- Interfaces:
  - Consumes: the refreshed design system bundle (S1)
  - Produces: package `@orasenda/ui` — `import "@orasenda/ui"` gives named exports `IntentPrompt`, `Button` (and the rest of the `window.Orasenda` namespace) typed from `index.d.ts`; `@orasenda/ui/components.css` (bundle.css without its font `@import`); `just ui-css`
- Acceptance:
  - [ ] `react-global.ts` sets `window.React` and is imported before `bundle.js` (ES import hoisting); a test imports `@orasenda/ui` and renders `IntentPrompt` without `window.React` being undefined.
  - [ ] `components.css` has no `@import` and no URL; regenerating it gives an identical file, and `just ci` fails when it is stale.
  - [ ] `react` is a peer dependency (the app's React is used; no second copy in `pnpm why react`).
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: `exports_intent_prompt_and_button`, `intent_prompt_renders_with_global_react`, `intent_prompt_without_on_wait_has_no_wait_button`, `components_css_has_no_import_or_url`, `components_css_is_deterministic`
- Notes: tests run with Vitest + jsdom (already in the repo from #8; if S4 lands before #8, add them through `baton:deps`). Polyfill `HTMLDialogElement.showModal/close` in the test setup if jsdom lacks it.

### S5: Spike wiring in the app crate
- Priority: 0
- Depends on: S2, S3, #8
- Owns: `apps/orasenda/src-tauri/src/spike/**`, `apps/orasenda/src-tauri/capabilities/overlay.json`, `apps/orasenda/src-tauri/tauri.spike.conf.json`
- Touches (read-only or additive): `apps/orasenda/src-tauri/Cargo.toml` (adds `orasenda-platform-macos` as a macOS target dependency), `src-tauri/src/lib.rs` (registers the spike commands/events in `specta_builder()` and calls `spike::setup` in `setup()`), `src-tauri/commands.list.rs` (adds the six spike commands), `capabilities/main.json` (adds the four `main` spike permissions), `apps/orasenda/src/bindings.ts` (regenerated)
- Interfaces:
  - Consumes: everything S2 produces; `MacForeground`, `MacAppControl`, `MacIdle`, `configure_overlay`, `cover_main_screen`, `focus_overlay`, `restore_activation_policy` from `crates/platform-macos` (S3); `specta_builder()`, `COMMANDS` from the app crate (#8)
  - Produces:
    - `spike::enabled() -> bool`; `spike::setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>>`
    - commands `spike_status() -> SpikeStatus { enabled: bool, platform_supported: bool }`, `spike_running_apps() -> Result<Vec<AppRef>, SpikeError>`, `spike_set_rule(rule: BlockRule) -> Result<(), SpikeError>`, `spike_usage() -> Result<Vec<UsageSegment>, SpikeError>`, `spike_overlay_ready() -> Result<(), SpikeError>`, `spike_overlay_choice(choice: OverlayChoice) -> Result<(), SpikeError>`
    - `SpikeError { Disabled, Unsupported, Platform(String) }` as `{ kind, message }` (`Disabled` wins over `Unsupported`); `OverlayChoice = { kind: "return" } | { kind: "continue", reason: string | null }`
    - events `overlay-show` (`OverlayShow { appName }`, to window `overlay`), `spike-usage-changed` (to `main`, ≤ 1/s)
    - TS (generated): `commands.spikeStatus()`, `commands.spikeRunningApps()`, `commands.spikeSetRule(rule)`, `commands.spikeUsage()`, `commands.spikeOverlayReady()`, `commands.spikeOverlayChoice(choice)`, `events.overlayShow`, `events.spikeUsageChanged`
- Acceptance:
  - [ ] All commands exist on every OS; `bindings.ts` is identical when regenerated on macOS and on the Windows job.
  - [ ] Flag off (or release): no observer, no `spike-idle` thread, no overlay window; commands other than `spike_status` return `Disabled`.
  - [ ] Wiring follows the spec's steps 1–4: hidden opaque `overlay` window (`overlay.html`), `LevelAndCollection` first; sink → tracker → `decide` → `Gate`; ready handshake re-emits a pending `OverlayShow`; termination of the target hides the overlay; `return` hides/terminates then activates the previous app (or shows `main`); `continue` allows and activates the target; elapsed ms logged per show.
  - [ ] No lock held across an AppKit call; AppKit window work goes through `run_on_main_thread`.
  - [ ] `tauri.spike.conf.json` sets `bundle.macOS.signingIdentity` `"-"` and `hardenedRuntime` `true`; `pnpm --filter orasenda tauri build --debug --bundles app --config src-tauri/tauri.spike.conf.json` produces `Orasenda.app`, and `open --env ORASENDA_SPIKE=1 --stderr /tmp/orasenda-spike.log` launches it with the flag on (checked by hand).
  - [ ] `just ci` passes, including the debug no-bundle build; `gh pr checks <pr> --required` passes.
- Tests first: `spike_disabled_without_flag`, `disabled_wins_over_unsupported`, `overlay_capability_grants_only_overlay_commands`, `main_capability_includes_spike_commands`, `manifest_commands_match_specta_builder` (existing, now with spike commands), `overlay_choice_serializes_tagged`, `spike_error_serializes_kind_message`
- Notes: the env var is read once in `setup()`. The strategy to use is a `const` in `spike/overlay.rs` so S7 can switch it in one line while running the matrix.

### S6: Overlay page and dev panel
- Priority: 0
- Depends on: S4, S5, #9
- Owns: `apps/orasenda/overlay.html`, `apps/orasenda/src/overlay.tsx`, `apps/orasenda/src/overlay.test.tsx`, `apps/orasenda/src/spike/**`
- Touches (read-only or additive): `apps/orasenda/vite.config.ts` (adds `overlay.html` to `build.rolldownOptions.input`), `apps/orasenda/src/App.tsx` (renders `<DevPanel />` when `spike_status().enabled`), `apps/orasenda/package.json` (adds `"@orasenda/ui": "workspace:*"`), `apps/orasenda/src/test/setup.ts` (dialog polyfill if needed), `pnpm-lock.yaml`
- Interfaces:
  - Consumes: the generated spike commands and events from `bindings.ts` (S5); `IntentPrompt`, `Button`, `components.css` from `@orasenda/ui` (S4); `tokens.css` (#7); `App.tsx` (#9)
  - Produces: `useSpike(): { status: SpikeStatus | null; apps: AppRef[]; rule: BlockRule; usage: UsageSegment[]; setRule(rule: BlockRule): Promise<void>; refreshApps(): Promise<void> }`; `<DevPanel />`; the overlay page
- Acceptance:
  - [ ] `overlay.html` sits next to `index.html` and is served at `/overlay.html` in dev and in the debug build.
  - [ ] Overlay: opaque `surface` background; `IntentPrompt` keyed per show, no `onWait`, `app` = `appName`; calls `spike_overlay_ready` once mounted; `undefined` reason sent as `null`.
  - [ ] Dev panel: rendered only when enabled; "Apps to intercept" checkboxes and "When I go back to focus" radios (*Hide the app* / *Quit the app*) use `.os-choice-group` / `.os-choice`; "Refresh apps" is the design system `Button`; usage list shows "name · start–end", "now" for the open segment, and idle gaps; times formatted like the shell clock.
  - [ ] No hex, px or font names in new CSS; both themes checked; keyboard and VoiceOver checked on the panel and the overlay.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: `overlay_renders_nothing_before_show`, `overlay_calls_ready_on_mount`, `overlay_shows_app_name`, `overlay_return_and_escape_send_return`, `overlay_continue_sends_reason_or_null`, `overlay_second_show_resets_reason`, `dev_panel_hidden_when_disabled`, `dev_panel_check_sets_rule`, `dev_panel_action_radio_sets_rule`, `dev_panel_open_segment_shows_now`

### S7: Run the matrix, write the findings, accept ADR-004/005
- Priority: 0
- Depends on: S6
- Owns: `docs/spikes/2026-11-07-macos-blocking.md`, `docs/DECISIONS.md` (ADR-004, ADR-005 entries and the Pending section)
- Touches (read-only or additive): `apps/orasenda/src-tauri/src/spike/overlay.rs` (only the strategy `const`, if a fallback wins), `crates/core/src/blocking.rs` (only `SAFETY_ALLOWLIST`, to add the Phone app's bundle ID if present), `docs/specs/2026-11-07-macos-blocking-spike.md` (Implementation status only), `docs/ROADMAP.md` (P0 spike line, if wording needs the result)
- Interfaces:
  - Consumes: the running spike (S5, S6)
  - Produces: none (docs and decisions)
- Acceptance:
  - [ ] The findings doc fills every matrix row (1–12, incl. 2b and 4b) for `tauri dev` and for the Launch-Services-launched spike bundle, with macOS version, hardware, the 10 timing samples per case, CPU average, the Privacy & Security observations, and which overlay strategy won.
  - [ ] If no strategy rises above full-screen apps, the findings say so and ADR-004 is accepted with "native AppKit overlay required" and a follow-up spec named; otherwise ADR-004 is accepted with the winning strategy.
  - [ ] ADR-004 and ADR-005 move to *accepted*, citing the findings; Close-mode results decide whether Close stays; the anti-quit helper stays an open follow-up; the Pending section is updated.
  - [ ] `./scripts/ci.sh` passes; `gh pr checks <pr> --required` passes.
- Tests first: none (manual matrix). Any bug found while running it goes through `baton:debug` and gets a regression test in the owning crate's task area via its own issue.
- Notes: if the Phone app exists, add its bundle ID to `SAFETY_ALLOWLIST` with a test in this PR.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: detection for every switching method | S3 (observer), S5 (sink), S7 (matrix row 1) |
| Goal 2: no TCC prompt, Launch Services bundle evidence | S5 (`tauri.spike.conf.json`, launch), S7 (row 6) |
| Goal 3: overlay above target ≤ 500 ms, key, no Space switch, VoiceOver | S3 (strategies, focus), S5 (timing log), S6 (UI), S7 (rows 2, 2b, 7) |
| Goal 4: Back to focus / Continue / allowlist / self | S2 (`decide`, `Gate`), S5 (choice handling), S6, S7 (rows 3–5, 4b) |
| Goal 5: usage segments and idle | S2 (tracker), S3 (`MacIdle`), S5 (idle thread), S6 (list), S7 (row 8) |
| Goal 6: CPU < 1 %, no polling | S3 (notifications), S7 (row 9) |
| Goal 7: dev-only | S5 (`spike_disabled_without_flag`), S6 (`dev_panel_hidden_when_disabled`), S7 (row 10) |
| Goal 8: boundaries, Windows job | S2 (boundary step), S3 (target deps), S5 (bindings on every OS) |
| Goal 9: findings and ADRs | S7 |
| Permissions: per-window capabilities, AppManifest | S5 |
| Overlay UI without Wait | S1, S4, S6 |
| `packages/ui` load order, components.css | S4 |
| Threading rules | S3, S5 |
| Edge cases: quit target, other app while open, rule change, refused hide/terminate | S2 (`gate_countable_app_while_open_closes_overlay`), S5, S7 (row 12) |
| Conventions additions | already in `docs/conventions.md` (merged with the spec) |
| Failure mode: overlay page not yet listening on first show | S6: `overlay_calls_ready_on_mount`; S5 re-emit on ready |
| Failure mode: `bindings.ts` differs on Windows | S5: acceptance (regenerated identically on the Windows job) |
| Failure mode: `hide` on a pid that no longer exists | S3: `hide_unknown_pid_is_not_found` |
| Failure mode: reason group carries over between shows | S6: `overlay_second_show_resets_reason` |
| Failure mode: `NSRunningApplication` called from a test thread | S3: `running_apps_runs_off_main_thread` |
