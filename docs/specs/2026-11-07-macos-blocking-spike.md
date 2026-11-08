# macOS detection-and-overlay spike — Spec

- Status: approved (2026-11-07, by the owner's delegate)
- Date: 2026-11-07
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP P0](../ROADMAP.md), [SPEC §2.6–2.7](../SPEC.md), [app shell spec](2026-11-07-app-shell.md), [ADR-001](../DECISIONS.md#adr-001-tech-stack-and-code-sharing), [ADR-004](../DECISIONS.md#adr-004-macos-app-blocking-approach), [ADR-005](../DECISIONS.md#adr-005-macos-usage-tracking-approach-and-permissions), [ADR-010](../DECISIONS.md#adr-010-platform-code-layout), design system [`IntentPrompt`](../../design/system/components/IntentPrompt/README.md)

## TL;DR
- A **macOS-only spike**, built on the app shell, that proves Orasenda can see which app is in front, cover it with a calm overlay (including over full-screen apps), and hide or close it — **without any macOS permission prompt**. It also measures idle time for tracking.
- Product logic (allowlist, block decision, usage segments) is pure Rust in `crates/core`; macOS calls live in a new `crates/platform-macos` (objc2), wired in by the app crate (ADR-010).
- The overlay is a Tauri webview window rendering the design system's `IntentPrompt` through a new `packages/ui`.
- The code is kept on `main` but is **dev-only**: it runs only when `ORASENDA_SPIKE=1` is set in a debug build.
- Its findings turn ADR-004 (blocking) and ADR-005 (tracking) from *proposed* into *accepted*. The anti-quit helper is a separate, later spike.

## Change in a nutshell
```
ORASENDA_SPIKE=1 pnpm --filter orasenda tauri dev
```
The main window gains a dev panel: a list of running apps with checkboxes, a choice of **Hide** or **Close**, and the last 20 usage segments ("Safari · 14:02–14:09"). Tick Safari, then ⌘Tab to Safari — even when Safari is full screen on its own Space — and within half a second this covers the screen:

```
            Is this what you intended?
   You opened Safari during a focus session.
     [ Back to focus ]   I need Safari now
```

*Back to focus* (or Escape) hides Safari (or quits it, in Close mode) and returns to the previous app. *I need Safari now* reveals an optional reason and *Continue to Safari*, which lets Safari through until another app comes to the front. There is no "Wait 10 minutes" button: the design system's `IntentPrompt` is first changed so it shows Wait only when `onWait` is passed (see [Decisions](#decisions)). No permission dialog appears at any point. Without the flag, or in a release build, none of this exists at runtime.

## Problem
Blocking and tracking (P5–P7) are Orasenda's main differentiator and its riskiest part: SPEC §7 asks how blocking can work on macOS without MDM, and SPEC §2.7 assumes foreground detection needs no permission. If Tauri cannot put a window above a full-screen app, or detection needs Accessibility or Screen Recording, the product plan changes. The roadmap's P0 exit criterion is "spike works", and ADR-001 left the platform code layout to this spike.

## Goals / Success criteria
1. **Detection:** with the flag on, every foreground change made by ⌘Tab, a Dock click, a window click, Spotlight, Mission Control and a Space swipe is logged with bundle ID and name. The manual matrix records each method as pass or fail.
2. **No permission prompt:** detection, hiding, closing, idle time and the overlay trigger no TCC prompt, and Orasenda does not appear under Privacy & Security → Accessibility, Screen Recording or Input Monitoring. Evidence counts only from the **spike bundle launched by Launch Services** — `open --env ORASENDA_SPIKE=1 --stderr /tmp/orasenda-spike.log …/Orasenda.app` — because when launched from a terminal (including `tauri dev`) macOS attributes prompts to the terminal app, which may already hold permissions. `tauri dev` results count for function only. The spike bundle is `pnpm --filter orasenda tauri build --debug --bundles app` with `bundle.macOS.signingIdentity "-"` (ad-hoc) and `bundle.macOS.hardenedRuntime true`. It keeps `debug_assertions`, so the flag works, while exercising the bundled app, its identity and hardened runtime. Its signing settings live in `src-tauri/tauri.spike.conf.json`, passed with `--config`, so the normal config is unchanged. This counts as evidence for accepting ADR-004/005; Developer ID and notarization are re-checked before the private beta (author's call).
3. **Overlay:** when a target app comes to the front, the overlay is visible on top of it within **500 ms** (median of 10 trials, measured from the notification to the overlay's `show` call plus a screen recording check), in each case: normal window, target full screen on its own Space, Stage Manager on. A target on a second display is an **observation, not pass/fail**: the overlay covers `NSScreen::mainScreen`, and the findings record which screen that was (author's call; per-display placement is a P6 question). The overlay window is key: Escape works without a click and keyboard focus starts on *Back to focus*; the target's Space stays the active Space (no Space switch); VoiceOver reads the title, message and both buttons. The 500 ms interval runs from the activation notification's arrival in the observer to the `show()` call returning, logged per trial.
4. **Actions:** *Back to focus* hides the target in Hide mode and quits it in Close mode; *Continue* closes the overlay and the same target does not trigger again until another app has been in front. Apps on the safety allowlist and Orasenda itself never trigger.
5. **Tracking:** usage segments (bundle ID, name, start, end) are built from foreground changes; 120 s without input closes the open segment and the next input reopens one. Nothing is written to disk.
6. **Cost:** with the flag on and no overlay showing, Orasenda's CPU stays below 1 % on average over 5 minutes (Activity Monitor), and detection adds no polling of the frontmost app.
7. **Dev-only:** without `ORASENDA_SPIKE=1`, or in a release build, no observer, idle thread, overlay window or dev panel is created, and the spike commands return `SpikeError::Disabled`. A test proves the flag-off case in a debug build; the release-build case is checked by hand (matrix row 10).
8. **Boundaries hold:** `crates/core` stays free of `tauri`, `tao`, `wry`, `objc2` and `cfg(target_os)`; `crates/platform-macos` compiles to an empty crate on other targets; `./scripts/ci.sh` passes on macOS and the Windows advisory job behaves as before.
9. **Decisions:** `docs/spikes/2026-11-07-macos-blocking.md` holds the filled-in manual matrix and measurements; ADR-004 and ADR-005 are updated from them and marked *accepted*; ADR-010 is accepted with this spec.

## Non-goals
- The anti-quit helper / strong lock (P7). It gets its own spike before P7; ADR-004 records it as an open follow-up.
- Blocking profiles, triggers, schedules, Gentle/Firm/Strong strictness, the 10-minute wait, the typed-reason pact (P6).
- Website blocking, the browser extension, the browser fallback, private-window detection (P6–P7).
- Storing usage data, retention, export, categories, the "never record" list (P5, on the ADR-002 store).
- Windows, iOS and Android implementations. Only the traits are shaped so they can follow.
- Developer ID signing and notarization (no certificate yet). The ADRs mark notarized behavior "re-check before the private beta".
- Production UI polish of the dev panel. It follows the UI rules but has no design review.
- Guided Focus-filter setup.

## Users & permissions
One local user. Least privilege applies to the webviews.

| Caller | Can | Cannot |
|---|---|---|
| Webview `main` | the shell's commands; `spike_status`, `spike_running_apps`, `spike_set_rule`, `spike_usage`; listen to `spike-usage-changed` | any other command; anything when the flag is off (commands return `Disabled`) |
| Webview `overlay` | `spike_overlay_choice`, `spike_overlay_ready`; listen to `overlay-show` | every other command, including the `main` window's spike commands |
| Orasenda process on macOS | read the frontmost app and its bundle ID and name; observe activation notifications; hide or terminate a regular app; read seconds since the last input event | read window titles, window contents, keystrokes or URLs; act on apps on the safety allowlist; request any TCC permission |

- Each new command is added to `AppManifest::commands` in `build.rs`. `capabilities/main.json` grants the four `main` commands; a new `capabilities/overlay.json` grants window `overlay` only `allow-spike-overlay-choice`, `allow-spike-overlay-ready`, `core:event:allow-listen` and `core:event:allow-unlisten`.
- `NSRunningApplication.terminate()` asks the app to quit normally (it can show its own "save changes?" dialog); `forceTerminate` and signals are never used. The spike adds **no entitlements**. If Close mode alone triggers an Automation prompt or fails under hardened runtime, that is a recorded limitation (ADR-004 then keeps Hide as the only action), not a failure of goal 2 for detection, hiding, idle or the overlay (author's call).
- **Safety allowlist** (in `crates/core`, never intercepted): `com.apple.FaceTime`, `com.apple.MobileSMS`, `com.apple.systempreferences`, `com.apple.VoiceOverUtility`, `com.apple.loginwindow`, `com.apple.accessibility.AccessibilityInspector`, `com.apple.dock`, and Orasenda's own identifier `com.veloud.orasenda`. If the installed macOS has a Phone app, the spike reads its bundle ID from `/System/Applications/Phone.app/Contents/Info.plist`, adds it to the list and records it in the findings.

## Tenancy & localization
- Single user, single device.
- Overlay copy is English only and uses `IntentPrompt`'s defaults with `app` set to the target's localized name (`NSRunningApplication.localizedName`).
- Usage segments carry UTC epoch milliseconds; the dev panel formats them like the shell clock (`Intl.DateTimeFormat`, hours and minutes).

## Domain model
All in `crates/core` (module `blocking` and module `usage`), pure, no `SystemTime::now()`:

- `AppRef { bundle_id: Option<String>, name: String, pid: i32 }` — serde, `specta::Type`.
- `BlockAction` — `Hide | Close`, serialized lowercase.
- `BlockRule { targets: BTreeSet<String>, action: BlockAction }` — targets are bundle IDs. `BlockRule::default()` has no targets.
- `Decision` — `Allow | Intercept`.
- `SAFETY_ALLOWLIST: &[&str]` — the list above.
- `decide(app: &AppRef, rule: &BlockRule, own_bundle_id: &str, extra_allow: &[String]) -> Decision` — `Allow` when the bundle ID is missing, equals `own_bundle_id`, is in `SAFETY_ALLOWLIST` or `extra_allow`, or is not a target; otherwise `Intercept`.
- `Gate` — tracks the *Continue* allowance: `Gate::new(own_bundle_id: String)`; `Gate::on_foreground(&mut self, app: &AppRef, decision: Decision) -> GateAction` says what to do. It returns `Ignore` for the app most recently allowed by `Gate::allow(bundle_id)` until a different *countable* app comes to the front — one with a bundle ID that is neither Orasenda's own nor on the safety allowlist (so the overlay's own activation does not reset the allowance) — and `Ignore` while an overlay is already open for that app (`Gate::overlay_open`, `Gate::overlay_closed`). `GateAction` is `Show | Ignore | CloseOverlay`. While the overlay is open: the same target returns `Ignore`; a *different* intercepted app (one with `Decision::Intercept` that is not the allowed app) returns `Show` — the overlay re-targets to it and the caller records it with `Gate::overlay_open`; any other countable app returns `CloseOverlay`.
- `UsageSegment { bundle_id: Option<String>, name: String, start_ms: u64, end_ms: Option<u64> }` — `end_ms: None` while open. Exported to TypeScript as `startMs: number`, `endMs: number | null` (`#[specta(type = specta_typescript::Number)]` / `#[specta(type = Option<specta_typescript::Number>)]` per ADR-007; epoch ms ≪ 2^53. specta-typescript 0.0.13 exports `f64` as `number | null`, so `f64` overrides are not used).
- `UsageTracker::new(idle_threshold_ms: u64)` with `on_foreground(app: &AppRef, at_ms: u64)`, `on_idle_sample(idle_ms: u64, at_ms: u64)`, `segments() -> &[UsageSegment]`. Rules: a foreground change closes the open segment at `at_ms` and opens one for the new app; an idle sample ≥ threshold closes the open segment at `at_ms − idle_ms` (the moment input stopped) and marks the tracker idle; the next sample below the threshold while idle reopens a segment for the last foreground app at `at_ms − idle_ms`; a timestamp earlier than the open segment's start is clamped to that start (never a negative duration). Constant `IDLE_THRESHOLD_MS = 120_000`. Keeps at most 500 segments (oldest dropped).
- Traits (module `platform`):
  - `trait ForegroundSource { fn frontmost(&self) -> Option<AppRef>; fn subscribe(&self, sink: Box<dyn Fn(AppRef) + Send + Sync>) -> Result<(), PlatformError>; }`
  - `trait AppControl { fn running_apps(&self) -> Vec<AppRef>; fn hide(&self, pid: i32) -> Result<(), PlatformError>; fn terminate(&self, pid: i32) -> Result<(), PlatformError>; fn activate(&self, pid: i32) -> Result<(), PlatformError>; }`
  - `trait IdleSource { fn idle_ms(&self) -> Result<u64, PlatformError>; }`
  - `enum PlatformError { Unsupported, NotFound, Refused, Other(String) }`

`crates/platform-macos` (crate `orasenda-platform-macos`, `#![cfg(target_os = "macos")]` at the crate root):
- `MacForeground` (`NSWorkspace.sharedWorkspace.notificationCenter`, `NSWorkspaceDidActivateApplicationNotification`, `frontmostApplication`), `MacAppControl` (`runningApplications` filtered to `activationPolicy == Regular`, `NSRunningApplication::runningApplicationWithProcessIdentifier`, `hide`, `terminate`, and `activate`: on macOS 14+ cooperative activation — `NSApplication.yieldActivationToApplication` then `NSRunningApplication.activateFromApplication:options:` — and `activateWithOptions` on 13), `MacIdle` (`CGEventSource::seconds_since_last_event_type(CombinedSessionState, kCGAnyInputEventType)`).
- `unsafe fn configure_overlay(ns_window: *mut c_void, strategy: OverlayStrategy) -> Result<(), PlatformError>`, `OverlayStrategy = LevelAndCollection | NonActivatingPanel | AccessoryPolicy` — the three attempts in [Behavior](#behavior--edge-cases).
- `unsafe fn cover_main_screen(ns_window: *mut c_void) -> Result<(), PlatformError>` — sets the window's frame to `NSScreen::mainScreen` (the screen holding the key window) natively, so AppKit's bottom-left coordinates never cross into Tauri's top-left ones.
- `unsafe fn focus_overlay(ns_window: *mut c_void) -> Result<(), PlatformError>` — makes the overlay key and Orasenda active without switching Spaces: `makeKeyAndOrderFront` plus, on 14+, `NSApplication.activate` (cooperative), on 13 `activateIgnoringOtherApps`. Whether the window can become key under each strategy is a matrix check.
- **Pointer safety:** the three `ns_window` functions are `unsafe fn` with a `# Safety` section: the pointer must be null or a live `NSWindow` for the duration of the call (null and non-`NSWindow` objects are errors, a dangling pointer is UB). The app crate never caches `ns_window()`; it calls `window.ns_window()` and the platform function inside one `unsafe` block on the main thread, per call.
- **Threading:** `NSWindow`, `NSApplication`, `NSScreen` calls and observer registration run on the main thread (`MainThreadMarker`); `subscribe` returns `Other("not on main thread")` elsewhere. `NSWorkspace.runningApplications` and `NSRunningApplication` methods are thread-safe and may run on any thread (so `cargo test` can call them). The app crate reaches the main thread with `AppHandle::run_on_main_thread`.

## Interfaces

```
crates/core/src/{blocking.rs, usage.rs, platform.rs}     new modules, re-exported from lib.rs
crates/platform-macos/                                     new crate orasenda-platform-macos
  Cargo.toml   objc2, objc2-foundation, objc2-app-kit, objc2-core-graphics, block2 under
               [target.'cfg(target_os = "macos")'.dependencies]; depends on orasenda-core.
               The app crate depends on this crate the same way, so the Windows job builds none of it
  src/{lib.rs, foreground.rs, control.rs, idle.rs, overlay.rs}
packages/ui/                                               new package @orasenda/ui
  react-global.ts  sets window.React; imported first, because ES imports are hoisted and
               bundle.js reads window.React when it runs
  index.ts     imports ./react-global, then design/system/components/bundle.js, and
               re-exports the namespace window.Orasenda with the types from index.d.ts
  components.css   generated from design/system/components/bundle.css without its font @import
  build.ts     regenerates components.css; ci.sh fails when it is stale
apps/orasenda/
  overlay.html, src/overlay.tsx          overlay entry next to index.html (second Vite input), renders IntentPrompt
  src-tauri/tauri.spike.conf.json        ad-hoc signing + hardened runtime for the spike bundle only
  src/spike/{DevPanel.tsx, useSpike.ts}  dev panel, rendered by App.tsx only when spike_status() is enabled
  src-tauri/src/spike/{mod.rs, commands.rs, state.rs, macos.rs, overlay.rs}
  src-tauri/capabilities/overlay.json
docs/spikes/2026-11-07-macos-blocking.md   findings: manual matrix, measurements, conclusions
```

**Switch.** `spike::enabled() -> bool` is `cfg!(debug_assertions) && std::env::var("ORASENDA_SPIKE").as_deref() == Ok("1")`, read once in `setup()`. When it is false nothing below is started. All spike commands exist in every build and on every OS so `bindings.ts` is identical everywhere; on non-macOS targets they return `SpikeError::Unsupported`.

**Commands** (all synchronous `#[tauri::command] #[specta::specta]` functions that do any AppKit work through `run_on_main_thread`, errors are `SpikeError { Disabled, Unsupported, Platform(String) }`, serialized as `{ kind, message }`; when both apply, `Disabled` wins):
- `spike_status() -> SpikeStatus { enabled: bool, platform_supported: bool }` — never errors.
- `spike_running_apps() -> Result<Vec<AppRef>, SpikeError>` — regular apps, sorted by name, Orasenda and the safety allowlist excluded.
- `spike_set_rule(rule: BlockRule) -> Result<(), SpikeError>` — replaces the rule in app state.
- `spike_usage() -> Result<Vec<UsageSegment>, SpikeError>` — newest first, at most 20.
- `spike_overlay_ready() -> Result<(), SpikeError>` — the overlay page is listening.
- `spike_overlay_choice(choice: OverlayChoice) -> Result<(), SpikeError>` — `OverlayChoice = { kind: "return" } | { kind: "continue", reason: string | null }`.

**Events:**
- `overlay-show` with `OverlayShow { app_name: String }` (serialized `appName`; the pid stays in Rust) — to window `overlay` only (`emit_to`).
- `spike-usage-changed` (no payload) — to window `main`, at most once per second; the panel then calls `spike_usage`.

**Wiring (app crate, `spike/macos.rs`).** In `setup()`, when enabled and on macOS:
1. Create window `overlay` hidden: `overlay.html` (at the app root next to `index.html`, a second input in Vite's `build.rolldownOptions.input`, so it is served at `/overlay.html`), no decorations, not resizable, `always_on_top`, `skip_taskbar`, `visible_on_all_workspaces`, **opaque** background, sized by `cover_main_screen` when shown. Transparent windows on macOS need Tauri's app-wide `macOSPrivateApi`, which would apply to release builds too, so the spike does not enable it (author's call); an opaque overlay also hides the distraction completely. Call `configure_overlay(ns_window, LevelAndCollection)`.
2. On the main thread, `MacForeground::subscribe(sink)`. The sink records `Instant::now()`, then calls `UsageTracker::on_foreground` and `decide` with the current rule, then `Gate::on_foreground`. When the gate says show, the app crate (on the main thread) calls `cover_main_screen`, emits `overlay-show`, calls `show()` and `focus_overlay`, and logs the elapsed milliseconds (`eprintln!("spike: overlay {} ms", …)`) for the findings.
   The overlay page calls `spike_overlay_ready` once its listener is attached; until then the app crate keeps the pending `OverlayShow` and re-emits it on ready, so the first event is never lost.
3. Start thread `spike-idle`: every 5 s, `MacIdle::idle_ms()` → `UsageTracker::on_idle_sample`.
4. `spike_overlay_choice`:
   - `return` → `hide` or `terminate` the target per the rule's action, `overlay.hide()`, `Gate::overlay_closed`, then `activate` the *previous app* (the last countable foreground app before the target that was not itself intercepted, kept in `SpikeState`; unchanged when the overlay re-targets) if it is still running, otherwise show Orasenda's main window. The user lands back where they were.
   - `continue` → `Gate::allow(bundle_id)`, `overlay.hide()`, `Gate::overlay_closed`, then `activate` the target so the user lands in it without ⌘Tab; the reason is logged with `eprintln!` (not stored).

   (Landing behavior is the author's call.)

State (`SpikeState`: rule, gate, tracker, current target) sits in one `Mutex` in Tauri managed state; no lock is held across an AppKit call.

**Overlay UI (`overlay.tsx`).** Listens to `overlay-show`, then renders `<IntentPrompt key={showCount} open app={appName} onReturn={…} onContinue={…} />` with no `onWait` (the 10-minute wait is P6). The `key` remounts it on every show, so a revealed reason group or chosen reason never carries over; an `undefined` reason is sent as `null`. It imports `@orasenda/tokens/tokens.css` and `@orasenda/ui/components.css`. The page background is the `surface` token (the window is opaque); `IntentPrompt` is centered on it. Whether a see-through scrim is wanted is a P6 design question.

**Dev panel (`DevPanel.tsx`).** Rendered under the shell UI only when `spike_status().enabled`. A `<fieldset>` "Apps to intercept" with one checkbox per running app; a `<fieldset>` "When I go back to focus" with radios *Hide the app* and *Quit the app*; a "Recent usage" list (name · start–end, or "now" for the open segment, "idle" gap rows). Each change calls `spike_set_rule`. It uses the design system's `Button` only for "Refresh apps"; the checkboxes and radios reuse the design system's `.os-choice-group` / `.os-choice` classes (44 px targets).

## Behavior & edge cases
- **Overlay strategy.** The spike first tries `LevelAndCollection`: window level `NSScreenSaverWindowLevel`, collection behavior `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`. If the overlay does not appear above a full-screen target, it tries `NonActivatingPanel`: a dynamic `NSPanel` subclass, declared with `objc2`'s `define_class!`, that overrides `canBecomeKeyWindow` → YES (a borderless panel returns NO, which would break focus and Escape), is swapped in with `object_setClass`, and gets the `nonactivatingPanel` style mask, the approach the `tauri-nspanel` plugin uses (the plugin itself is git-only and not added). The swap drops tao's window-class overrides; the findings record any lost behavior. then `AccessoryPolicy` (`NSApplication.setActivationPolicy(.accessory)` while the overlay shows, `.regular` after). The findings record which worked, and the winner becomes the default. If none works, the spike **stops and reports**: the findings say "Tauri overlay not viable above full-screen apps", ADR-004 is accepted with a native AppKit overlay as the required direction, and building it becomes its own spec. Detection, hiding, closing and tracking are still completed and accepted (decided by the owner).
- **Orasenda's own activation** (the overlay or main window taking focus) produces a foreground event for `com.veloud.orasenda`: `decide` returns `Allow`, the tracker records it like any app.
- **No bundle ID** (command-line tools, some helpers): never intercepted; tracked with the name only.
- **Target reactivates while the overlay is open:** `Gate::on_foreground` returns `Ignore`; no second `show`.
- **Target quits while the overlay is open** (`NSWorkspaceDidTerminateApplicationNotification` for the target's pid): the overlay hides and `Gate::overlay_closed` runs.
- **Another app comes to the front while the overlay is open** (e.g. a notification click): if it is countable and not itself intercepted, the overlay hides and `Gate::overlay_closed` runs, so keystrokes never go to an app hidden behind the overlay; if it is another target, the overlay stays up and re-targets (`overlay-show` is emitted with the new name, `SpikeState.target` is replaced, `previous` is unchanged); Orasenda's own activation and allowlisted apps leave it open.
- **Rule changes while the overlay is open:** the open overlay stays; the new rule applies from the next foreground change.
- **`hide` / `terminate` fails** (returns `false`, or the pid no longer exists): `PlatformError::Refused` / `NotFound` is logged, the overlay still hides, and the case goes in the findings.
- **App refuses to quit** (unsaved-changes dialog): Orasenda does not retry; the app's own dialog stays.
- **Second display:** the overlay covers `NSScreen::mainScreen` only. Covering every screen is a P6 question, recorded in the findings.
- **Sleep and wake, fast user switching:** on wake the next idle sample re-syncs the tracker; while another user's session is active, Orasenda receives no activation events (recorded in the findings).
- **Escape** in the overlay is *Back to focus* (`IntentPrompt` default).
- **Reduce motion:** `IntentPrompt`'s breath animation follows the design system's reduce-motion rule; nothing extra.
- **Flag off / release build:** `spike_status` reports `enabled: false`, the panel is not rendered, the overlay window does not exist, other spike commands return `Disabled`.

## Data & migrations
None. Usage segments live in memory (at most 500) and disappear when the app quits. No files, settings or keychain entries.

## Testing strategy
**Rust — `crates/core`** (`cargo test`):
- `decide`: target → `Intercept`; non-target → `Allow`; each `SAFETY_ALLOWLIST` entry targeted → `Allow`; own bundle ID targeted → `Allow`; missing bundle ID → `Allow`; `extra_allow` → `Allow`; empty rule → `Allow`.
- `Gate`: continue suppresses the same app; a different countable app in between resets it; Orasenda's own activation, an allowlisted app and an app without a bundle ID do not reset it; a countable app arriving while the overlay is open returns `CloseOverlay`; an open overlay suppresses a repeat; `overlay_closed` re-enables; a different target arriving while the overlay is open returns `Show` (re-target), and the same target afterwards returns `Ignore`.
- `UsageTracker`: switch closes and opens segments; idle ≥ threshold closes at `at_ms − idle_ms`; activity after idle reopens; idle below threshold does nothing; out-of-order timestamp is clamped; 501st segment drops the oldest.
- Serialization: `BlockAction` lowercase, `OverlayChoice` tagged `kind`, `SpikeError` as `{ kind, message }`.

**Rust — `crates/platform-macos`** (macOS only; runs in the `ci` job):
- `idle_ms_is_available` — returns `Ok` (no permission needed).
- `running_apps_contains_regular_apps` — non-empty on the runner, every entry has a name.
- `frontmost_returns_some` — `#[ignore]` (depends on a GUI session); run by hand and noted in the findings.
- `subscribe_off_main_thread_errors`.

**Rust — app crate:**
- `spike_disabled_without_flag` — with the env var unset, `spike_status().enabled == false` and `spike_running_apps` returns `Disabled`.
- `manifest_commands_match_specta_builder` (existing) covers the new commands.
- `overlay_capability_grants_only_overlay_choice` — parses `capabilities/overlay.json` and asserts the exact permission set.

**UI — Vitest** (`mockIPC`, as in the shell; a test setup polyfills `HTMLDialogElement.showModal`/`close` if jsdom lacks them):
- Overlay: calls `spike_overlay_ready` on mount; a second `overlay-show` resets a revealed reason group; renders nothing before `overlay-show`; after it, shows the app name; *Back to focus* and Escape call `spike_overlay_choice` with `{ kind: "return" }`; *Continue* with a reason calls it with `{ kind: "continue", reason }`.
- Dev panel: not rendered when `spike_status` reports disabled; checking an app calls `spike_set_rule` with that bundle ID; the open segment renders "now".

**`ci.sh`:** `packages/ui/components.css` staleness check (and Biome ignores that generated file); `cargo tree -p orasenda-core` boundary also rejects the `objc2` and `block2` families and the `windows`/`windows-core` crates by exact name (not `windows-sys`, `windows-targets` or `windows-link`, which pure crates pull in under `cfg(windows)`); `cargo clippy` and `cargo test` cover the new crate on macOS. No change to the Windows job: the crate is empty there.

**Manual macOS matrix** (filled in `docs/spikes/2026-11-07-macos-blocking.md`, for `tauri dev` and for the spike bundle described in goal 2):
| # | Check | Expected |
|---|---|---|
| 1 | ⌘Tab, Dock click, window click, Spotlight, Mission Control, Space swipe to a target | event logged, overlay shown |
| 2 | Target in a normal window / full screen on its own Space / with Stage Manager | overlay above it; notification-to-`show()` ≤ 500 ms, median of 10; Space unchanged; Escape works without a click |
| 2b | Target on a second display (observation) | record which screen the overlay covers |
| 3 | Back to focus in Hide mode / Close mode, with the target in a window and full screen | target hidden / quits normally; record what a hidden full-screen app leaves on screen |
| 4 | Continue (lands in the target), switch to Orasenda and back, then to another app and back | no overlay; no overlay; then overlay |
| 4b | Back to focus | lands in the previous app |
| 5 | Target on the safety allowlist; Orasenda itself | no overlay |
| 6 | Privacy & Security panes; any prompt | Orasenda absent; no prompt |
| 7 | Keyboard only; VoiceOver | focus on *Back to focus*; title, message, buttons read |
| 8 | Idle 3 min, then move the mouse | segment closed at idle start, new one opened |
| 9 | 5 min with the flag on, no overlay | CPU < 1 % average |
| 10 | Flag off; release build | no panel, no overlay, no observer |
| 11 | Light and dark appearance | overlay and panel render from tokens |
| 12 | A notification or another app comes to the front while the overlay is open | overlay hides |
| 12b | ⌘Tab from one target straight to another while the overlay is open | overlay stays, shows the new app's name |

## Dependencies to vet (`baton:deps`, read from crates.io on 2026-11-07)
Matched to the versions Tauri 2.12.5 already depends on (`objc2 ^0.6`, `objc2-app-kit ^0.3.2`, `objc2-foundation ^0.3.2`), so no second copy enters the tree. All need Rust ≥ 1.71 and none is yanked. The implementing task vets each one (add in a copy + `cargo audit`), enabling only the Cargo features for the classes it uses.

| Crate | Version | Use |
|---|---|---|
| objc2 | 0.6.5 | runtime, `MainThreadMarker`, class swap for the panel strategy |
| objc2-foundation | 0.3.2 | `NSNotificationCenter`, `NSString` |
| objc2-app-kit | 0.3.2 | `NSWorkspace`, `NSRunningApplication`, `NSWindow`, `NSScreen`, `NSApplication` |
| objc2-core-graphics | 0.3.2 | `CGEventSource` idle time |
| block2 | 0.6.2 | notification observer block |

No new npm packages: `packages/ui` wraps the design system's existing `bundle.js` and uses the React already in the app.

## Decisions
- [ADR-010: Platform code layout](../DECISIONS.md#adr-010-platform-code-layout) — accepted with this spec: pure traits and types in core, one `crates/platform-<os>` per OS, wired by the app crate.
- [ADR-004: macOS app-blocking approach](../DECISIONS.md#adr-004-macos-app-blocking-approach) — written as *proposed*; accepted by the spike's final task from the findings. The anti-quit helper stays an open follow-up there.
- [ADR-005: macOS usage-tracking approach and permissions](../DECISIONS.md#adr-005-macos-usage-tracking-approach-and-permissions) — same.
- **Design system change (design-first):** `IntentPrompt` renders "Wait 10 minutes, then decide" only when `onWait` is passed, the way it already treats `onContinue`. The first task of this spike's plan updates the artifact, then refreshes `design/system/` from it, before any overlay code.
- `docs/conventions.md` gains: OS code lives only in `crates/platform-<os>`; core never depends on `objc2` or `windows`; window, application and screen calls run on the main thread; spike code runs only behind `spike::enabled()`.

## FAQ
### Why keep the spike code instead of throwing it away?
P5 and P6 need exactly this detection, control and overlay code. Keeping it under tests and CI now, behind a dev-only flag, means those phases extend it instead of rewriting it.

### Why a runtime flag rather than a Cargo feature?
`bindings.ts` is generated by `cargo test` and must be byte-identical on macOS, Windows, with and without the switch, or the staleness check fails. A runtime flag that only debug builds honor keeps one command list everywhere and still keeps the spike out of release behavior.

### Why NSWorkspace notifications rather than polling or `CGWindowList`?
Notifications are event-driven (no CPU while nothing changes) and need no permission. Polling `frontmostApplication` adds latency and wakeups; `CGWindowList` needs Screen Recording to read window owners' names reliably and reads more than Orasenda should.

### Why a Tauri webview overlay rather than a native `NSPanel`?
It reuses the design system's `IntentPrompt` (accessibility, copy, motion) instead of rebuilding it in AppKit. The spike's fallback strategies include turning that window into a non-activating panel, so the native route is tested if the plain window fails.

### Why does the overlay cover only the main screen?
It is the screen with the key window, which is where the target app is. Covering every screen is a product question for P6 (it hides other work too) and the findings record how it behaves.

### Why is the anti-quit helper out of scope?
It is a separate process with its own install, signing and launch story (login item, `SMAppService`), and it is only needed for the P7 strong lock. A spike of its own before P7 keeps this one small.

## Open questions
None.

## Implementation status
- [x] Plan: `docs/plans/2026-11-07-macos-blocking-spike.md`
- [x] Issues: #12 (S1), #19 (S2), #13 (S3a), #20 (S3b), #14 (S4), #15 (S5a), #16 (S5b), #17 (S6), #18 (S7)
- Blocked on the app shell: #6, #8, #9 merged.
- The plan splits the spec's `spike/wiring.rs` into `spike/state.rs` (S5a) and `spike/macos.rs` + `spike/overlay.rs` (S5b); behavior is unchanged.
