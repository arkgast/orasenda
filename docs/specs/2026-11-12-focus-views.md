# Focus views (P1 sub-project D) — Spec

- Status: implemented (2026-11-12; see Implementation status)
- Date: 2026-11-12
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP P1 row D](../ROADMAP.md#p1-sub-projects) (`docs/ROADMAP.md:48`), [spec A](2026-11-08-focus-session-loop.md), [spec C](2026-11-11-today-redesign.md) (reserved Today's top-right cell and "Commands… ⌘K" for D, `docs/specs/2026-11-11-today-redesign.md:49-50`), [P1 Components](2026-11-10-p1-components.md), the redesign brief §2.3, §3.10–3.12, §3.14 and Q7–Q9 (`design/reviews/04-redesign-pass/01-brief.md:179-196,466-548,566-584,669-671`) and its critique F1, F7 (`02-brief-critique.md:34-40,84-90`), ADR-004, ADR-012, ADR-013, ADR-014, ADR-015, proposed ADR-016 (this spec), #326 (VoiceOver pass, end of P1).

## TL;DR
- Today's reserved top-right cell gets the **Focus view** button. It opens a native menu: **Full screen** (one item per display when there are several) and **Floating timer, hide Orasenda**.
- **Full screen** is a borderless **Focus window** on the chosen display, at normal window level, not macOS native full screen. Other displays stay usable whatever the "Displays have separate Spaces" setting.
- The **floater** is a non-activating, always-on-top panel on every Space, including full-screen apps' Spaces. It never takes focus by itself. Its frame is remembered per display in a new device-only `window_frame` table.
- A native **Focus** menu in the app menu bar holds Full Screen ⌘⇧F, Floating Timer ⌘⇧T and Commands… ⌘K. Rust handles all three, so they work from any Orasenda window. ⌘K opens the **command palette** in the main window. The menu-bar menu gains Full screen and Show/Hide floating timer.
- Every new window is its own HTML entry with its own capability file and renders the latest `timer-tick` payload, with no new product state (ADR-013). ADR-016 "Windows and surfaces" records the window model. D builds no design-system component: `FullScreenFocus`, `FloatingTimer` and `CommandPalette` come from Components.

## Change in a nutshell
On Today, idle, with a laptop and a DELL monitor, press the Focus view button (top right):

```
 Full screen on Built-in Retina Display   ⇧⌘F
 Full screen on DELL U2720Q
 Floating timer, hide Orasenda            ⇧⌘T
```

Choose the DELL item. A borderless Focus window covers the DELL display: idle ring, the preset summary, Start focus, and the caption "⌘↩ starts · Esc leaves". The menu bar and Dock stay drawn on that display, and Today stays usable on the laptop. Press ⌘↩ and the session runs in both windows. Esc opens "Leave full screen?". At the end the Focus window stays, showing "Session ended." and Start.

Now press ⌘⇧T, from Today, from the Focus window or from the floater itself. Today hides, and a 280×64 floater appears where it was last left on that display. It floats over a full-screen Keynote and stays in front when you switch Spaces. Clicking it does not take the menu bar away from Keynote. With key focus, Space pauses, Return opens Orasenda (closing the floater), and Esc closes it.

In general, a focus view is one more subscriber to the same Rust state. Opening, closing or moving one never changes the session.

## Problem
Spec A and C give the timer only Today and the menu-bar item. The owner asked for the time on any screen while Orasenda is hidden, and for a full-screen view on a chosen display without dragging (brief §2.3, owner directions 1–2). The components are built (`packages/ui/src/components/ui/{full-screen-focus,floating-timer,command-palette}.md`). The windows, menus and wiring that host them are not, and E and F both depend on these hosts (`docs/ROADMAP.md:49-50`).

## Goals / Success criteria
1. The Focus view button sits in Today's top-right cell (`apps/orasenda/src/features/today/Today.tsx:217-218`), idle and running, at every Today size, without moving any other Today element. Every Today harness case still passes.
2. Its menu lists exactly one "Full screen" item when there is one display. With several displays, it lists "Full screen on <NSScreen.localizedName>" for each display, the main window's display first and carrying ⇧⌘F, then "Floating timer, hide Orasenda" ⇧⌘T.
3. Full screen opens a borderless window whose frame equals the chosen display's `frame`, at normal level, with collection behaviour `fullScreenAuxiliary | moveToActiveSpace`. A Rust test checks the window spec. A hands-on check on two displays, with "Displays have separate Spaces" on and off, confirms the other display stays usable.
4. The Focus window's content is laid out inside the insets that bring the display's `frame` to its `visibleFrame`, so the menu bar and Dock never cover a control. Its background fills the whole frame. It passes the `FullScreenFocus` README harness cases (`full-screen-focus.md:14`) as a hosted page, with and without insets.
5. The floater is a non-activating panel at floating level on all Spaces. Clicking it, or opening it with ⌘⇧T, the Focus menu, the menu-bar item or ⌘K, makes it key without making Orasenda the active app (hands-on: the frontmost app's menu bar stays). It passes the `FloatingTimer` README sizes 280×56, 280×64 and 360×96 (`floating-timer.md:3`) as a hosted page.
6. The floater's frame is stored per display in `window_frame`, writes no `change_log` row, and is used again after a relaunch. A frame that no longer fits its display is clamped inside `visibleFrame`.
7. ⌘⇧F, ⌘⇧T and ⌘K work with key focus in the main window, a Focus window or the floater. ⌘K brings the main window forward and opens the palette there.
8. The palette lists only the commands that are available right now (§ Interfaces, "Command palette"). Every one runs through the same Rust command as its button or menu twin.
9. Each new window has its own HTML entry and capability file. Rust tests assert each capability's window list and permissions, and that no window has a permission it doesn't use.
10. Every touched or new file stays ≤ 500 lines (`docs/conventions.md:58-80`). Tokens only, both themes, no red, kind copy, a visible focus ring on every stop.

## Non-goals
- **E's states and behaviour:** breaks, the two-minute warning, keep-going, +10 min, the intent line. D renders whatever `mode` the view carries (the components already draw break and warning). E's floater and Focus window task comes after D merges (`docs/ROADMAP.md:49`).
- **F's keys:** the global ⌃⌥F and ⌃⌥N, Settings › Keyboard, the single-key setting, the F key on Today, Space on Today, and "Capture a thought" in the menus and the palette. D shows no shortcut that doesn't exist yet, including the ⌃⌥F inert text the menu-bar README mentions (`menu-bar-timer.md:38`).
- **A preset library:** E replaces the fixed `Preset` enum and Custom. D only stops hard-coding the list in the places it touches (§ Shared with E).
- **Remembering focus views across launches:** neither a Focus window nor the floater reopens at launch, and Full screen remembers nothing (brief §2.3).
- **Windows and Linux behaviour:** the code compiles there (advisory CI, ADR-001), but `displays_list` answers an empty list and the Focus view button, Focus menu items and tray items are absent.
- **VoiceOver passes** (deferred to #326) and **screenshots in PRs** (the owner reviews visuals; see Testing strategy).
- **Design-system changes:** none planned. If one turns out to be needed, it is its own code-first PR (ADR-015) with a first-consumer check (`docs/conventions.md:113-126`).

## Users & permissions
One local user, no accounts. Webview permissions are per window (ADR-013, ADR-016):

| Capability file (`windows` pattern) | Permissions, exactly | Cannot |
|---|---|---|
| `main.json` (`main`) | today's list (`apps/orasenda/src-tauri/capabilities/main.json:6-22`), plus `allow-displays-list` and `allow-focus-view-open` | `focus_view_close`, `main_show`, `timer_view`, `preset_select` |
| `focus.json` (`focus-*`) | `core:event:allow-listen`, `core:event:allow-unlisten`, `allow-timer-view`, `allow-timer-start`, `allow-timer-pause`, `allow-timer-resume`, `allow-timer-stop`, `allow-settings-get`, `allow-presets-get`, `allow-preset-select`, `allow-focus-view-close` | `settings_set`, `timer_state` (it would drain main's pending milestones), `native_menu_popup`, navigation, notifications, any `core:window:*` |
| `floater.json` (`floater`) | `core:event:allow-listen`, `core:event:allow-unlisten`, `core:window:allow-start-dragging` (the drag region), `allow-timer-view`, `allow-timer-start`, `allow-timer-pause`, `allow-timer-resume`, `allow-settings-get`, `allow-native-menu-popup`, `allow-focus-view-close`, `allow-main-show` | `timer_stop` (no End on the floater), `settings_set`, `timer_state`, `preset_select`, any other `core:window:*` |
| `dev.json` (`dev`), `overlay.json` (`overlay`) | unchanged (spike only) | anything above |

Showing, hiding, framing and closing windows all happen in Rust, so no webview needs another `core:window:*` permission. The capability tests (`apps/orasenda/src-tauri/src/lib.rs:183-300`) assert each file's exact `windows` **pattern** list (`["main"]`, `["dev"]`, `["focus-*"]`, `["floater"]`, `["overlay"]`) and its exact permission list. They do not assert resolved window labels. Tauri labels allow `-`, so `focus-<display UUID>` matches `focus-*`.

## Tenancy & localization
n/a for tenancy (one device, one user). Copy is English only, like the rest of P1. Display names come from `NSScreen.localizedName` as macOS gives them, never translated or shortened. Times inside the views are formatted in Rust (ADR-011).

## Domain model
- **Display:** a connected screen. Fields: `id` (a stable key: the display's `CGDisplayCreateUUIDFromDisplayID` UUID string), `name` (`localizedName`), `frame` and `visibleFrame` (points), `hasMainWindow` (the display that holds the main window's frame as Rust recorded it on main's last move, resize or show; not `NSWindow.screen` of a hidden window; if nothing is recorded, `NSScreen.mainScreen`). The order is the display with the main window first, then `NSScreen.screens` order. Read from AppKit on demand, never stored.
- **Focus window:** at most one per display, label `focus-<display id>`, created on demand and destroyed on leave. It has no state of its own: the view comes from `timer-tick`. "Ended" is local UI state set by the `ended` milestone and cleared by the next start, as on Today.
- **Floater:** at most one, label `floater`. Shown or not is Rust state in the app crate (whether the window exists), read by the tray and the Focus menu.
- **Window frame** (`window_frame`, device-only, ADR-012): `(window, display) → (x, y, width, height, updated_at)`. `window` is `'floater'` in D. Coordinates are integer points, rounded, relative to the display frame's top-left. platform-macos converts from AppKit's bottom-left global coordinates. The floater opens on the connected display with the newest `updated_at`; with no stored frame, it opens on the main window's display at the default frame (Author's calls). Two identical monitors: the most recently written frame wins. The display key is the ColorSync display UUID (Open question 2, resolved in #354); frames stored under the old `<NSScreenNumber>-<name>` key move to the UUID key the first time they are read. Only a screen with no UUID falls back to the old key; if that key doesn't match after a relaunch, the floater opens at its default position. That is accepted degradation.
- **Invariants:** opening or closing any focus view never calls the session service. Every surface renders the last `timer-tick` payload. Rendering is a pure function of that payload (ADR-013, `docs/DECISIONS.md:180-193`).

## Interfaces

### Windows (Rust, app crate)
Pure specs beside the builders, tested like `dev_window_spec` (`apps/orasenda/src-tauri/src/spike/window.rs:19-28`). They live in a new `apps/orasenda/src-tauri/src/windows/` folder: `mod.rs`, `focus.rs`, `floater.rs`, `frames.rs`.

| | Focus window | Floater |
|---|---|---|
| Page | `focus.html` | `floater.html` |
| Tauri builder | `decorations(false)`, `resizable(false)`, `skip_taskbar(true)`, `visible(false)` until framed | `decorations(false)`, `resizable(true)`, min `floater-width × floater-min-height`, max `floater-max-width × floater-max-height`, default `floater-width × floater-height` (`packages/tokens/tokens.json:162-166`; a test compares them), `skip_taskbar(true)`, `visible(false)` until configured |
| AppKit (platform-macos) | frame = display `frame` (AppKit coordinates, as `cover_main_screen` does); level `NSNormalWindowLevel`; `fullScreenAuxiliary | moveToActiveSpace` | the class swap to a key-capable `NSPanel` (`crates/platform-macos/src/overlay.rs:112-200`), `nonactivatingPanel`; level `NSFloatingWindowLevel`; `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`; `hidesOnDeactivate = NO` (NSPanel's default is YES) |
| Shown with | `makeKeyAndOrderFront` + app activation (it is a normal window) | `orderFrontRegardless`, then `makeKeyWindow` without activating the app |
| Content inset | the `visibleFrame` insets, passed as `focus.html?display=<id>&insets=t,r,b,l` and updated by the `focus-insets` event | none |

- **platform-macos:** a new `crates/platform-macos/src/windows/` module (`displays.rs`, `focus_window.rs`, `floater.rs`). `overlay.rs` is 412 lines, so it only makes `swap_to_panel_class` `pub(crate)` and gains no new code. It exports `displays()`, `configure_focus_window(ns_window, display_id)`, `configure_floater(ns_window)`, `key_without_activation(ns_window)` and `frame_of(ns_window)` / `set_frame(ns_window, frame)` in display-relative points. These are `unsafe fn` with the same `# Safety` contract and main-thread check as `overlay.rs:30-46`. They add a screen-parameters observer (`NSApplicationDidChangeScreenParametersNotification`) that calls back into the app crate.
- **Activation policy** stays `Regular` (spec A, open question 1, `docs/specs/2026-11-08-focus-session-loop.md:332`). Hiding `main` changes nothing about the Dock. After the floater closes, no Orasenda window may be visible. That is intended: the menu bar and the Dock remain. Rust emits ticks to every window whether it is visible or not, so a hidden `main` stays current.
- **Main's frame:** Rust records `main`'s frame on its `Moved`, `Resized` and show. This feeds `hasMainWindow`.
- **Frame debouncer** (app crate, `windows/frames.rs`): one trailing 500 ms timer per remembering window, on the existing `spawn_blocking` pattern. The window's frame is read on the main thread, with no lock held across the AppKit call. The write goes through the service.
- **Lifecycle:** `on_close_requested` (`apps/orasenda/src-tauri/src/lifecycle.rs:44-51`) stays: only `main` hides. `focus-*` and `floater` close normally (⌘W included). `WindowEvent::Destroyed` for `floater` updates the shown flag and redraws the tray and Focus menu. `WindowEvent::Moved` and `Resized` for `floater` save its frame (§ Data).
- **Display changes:** on a screen-parameters change, Rust rebuilds the Focus menu and the tray submenu, re-frames each Focus window to its display and emits `focus-insets`, and closes a Focus window whose display is gone. A floater whose display is gone moves to the main window's display at that display's stored or default frame.

### Commands (all added to `commands.list.rs`, the specta builder and the capability tests, `apps/orasenda/src-tauri/src/lib.rs:25-58,183-300`)

| Command | Who | Does |
|---|---|---|
| `displays_list() -> Vec<DisplayInfo>` | main | `{ id, name, hasMainWindow }` in menu order; `[]` off macOS or on failure (logged) |
| `focus_view_open(target: FocusViewTarget)` | main | `{ kind: "fullScreen", displayId }` opens (or focuses) that display's Focus window; `{ kind: "floater" }` opens the floater with key focus, then hides `main`. Error `{ kind: "unavailable" \| "noDisplay", message }` |
| `focus_view_close()` | Focus window, floater | closes the calling window; refused for `main` |
| `main_show()` | floater | `lifecycle::show_main`, then closes the floater (Open Orasenda) |
| `timer_view() -> TimerView` | Focus window, floater | the current view, **without** draining pending milestones or setting `listening`. `timer_state` does both (`SessionService::state`, `crates/service/src/session/view.rs:12-20`). It calls a new `pub fn run_view<H: Host>(host) -> TimerView` in `crates/service/src/session/run.rs`, which takes the lock and returns `SessionService::view(now_ms)` (`view.rs:23`, `&self`, no tick and no publish). Wired through `runtime/session.rs` like `run_state` (`apps/orasenda/src-tauri/src/runtime/session.rs:51-53`) |
| `preset_select(preset)` | Focus window | saves the preset through the same Rust path as the tray's Preset submenu (`apps/orasenda/src-tauri/src/tray/menu.rs:254-256`), so a second webview never sends a whole `Settings` object (ADR-014). While a session runs or is paused it returns `TimerCommandError { kind: wrongState }` and saves nothing |
| `native_menu_popup` (changed) | main, floater | pops up in the **calling** window, no longer always `main` (`apps/orasenda/src-tauri/src/commands/menu_popup.rs:180-182`) |

Events: `timer-tick`, `timer-milestone`, `clock-tick` and `settings-changed` already broadcast to every window (`apps/orasenda/src-tauri/src/runtime/events.rs:20-39`). New: `focus-insets` (to one Focus window) and `palette-open` (to `main`, no payload).

### The Focus menu (app menu bar, macOS)
Inserted after View in the default menu (`apps/orasenda/src-tauri/src/menu/app_menu.rs:80-104`):

```
Focus
  Full Screen                     ⇧⌘F     (one display)
  Full Screen ▸  Built-in Retina Display  ⇧⌘F   (several: main window's display first)
                 DELL U2720Q
  Floating Timer                  ⇧⌘T     (opens it, or gives it key focus when shown)
  ─
  Commands…                       ⌘K
```

- Accelerators `CmdOrCtrl+Shift+F`, `CmdOrCtrl+Shift+T` and `CmdOrCtrl+K` are registered once, here. NSMenu key equivalents fire only from the main menu tree, or inside a popup while it is open. So the accelerators shown in the Focus view and Pages popups are display only. The webview binds none of them (no `useShortcuts` entry). A Vitest case and a hands-on check confirm that one ⌘K opens the palette exactly once.
- ⌘K: `lifecycle::show_main`, then emit `palette-open` to `main`. From a Focus window or the floater, the main window comes forward and that window stays as it is.
- **Split (500-line rule):** `menu/app_menu.rs` (158 lines) keeps the Settings insertion. A new `menu/focus_menu.rs` holds the pure model (`focus_menu_entries(displays, floater_shown)`), the native build and its events. `menu/mod.rs` dispatches ids. The ids are namespaced `focus:` and disjoint from the tray's and `popup:` (tested as in `app_menu.rs:149-157`).

### The menu-bar menu (tray)
Following brief §3.10, minus F's items. In both idle and running states, after the session group and before Show Orasenda:

```
 ─
 Full screen            (or Full screen ▸ with one item per display, main window's display first)
 Show floating timer    (reads "Hide floating timer" while it is shown)
```

- No accelerators on these items: the Focus menu owns them, so there is no second registration.
- "Show floating timer" opens it with key focus and hides `main`, like every other open path.
- The idle Preset submenu stops using the hard-coded `PRESETS` (`tray/menu.rs:25-30`). It is built from `preset_lengths()` (`crates/service/src/api/settings.rs:50`) plus Custom from the saved settings, the same source Today reads through `presets_get` (`apps/orasenda/src/features/today/presets.ts:18-37`).
- `MenuEntry::Item.id` becomes an owned `String` (it is `&'static str` today, `tray/menu.rs:69`), because display items carry the display id.
- `tray/menu.rs` is 352 lines. Its move-only split into `tray/menu/{mod,entries,commands,native}.rs` (`docs/conventions.md:76-77`) is **D's first task**. E's tasks that touch the tray rebase on it, and the plan sequences them.

### Today: the Focus view button
- In `today-top-end`: `IconButton` with `label="Focus view"`, `icon={<Icon name="expand" />}`, `aria-haspopup="menu"`, `aria-expanded` from the open state, no `shortcut` (F is F's). The tooltip is the label. It is available idle, running and paused.
- On click: `displays_list()`, then `native_menu_popup` at the button's bottom-left, as `PagesButton` does (`apps/orasenda/src/app/PagesButton.tsx:26-52`). Items: `Full screen` (`Cmd+Shift+F`) or one `Full screen on <name>` per display (only the first carries `Cmd+Shift+F`), then `Floating timer, hide Orasenda` (`Cmd+Shift+T`). A chosen id calls `focus_view_open`. An empty display list hides the button (off macOS). A failed open shows the failure in Today's status row: "The focus view didn't open. Try again."
- **Pages menu** (compact): "Commands…" with `Cmd+K` is added after the six pages. Choosing it opens the palette directly.

### Focus window page (`focus.html`, `apps/orasenda/src/features/focus/`)
- Hosts `FullScreenFocus` filling a body that is padded by the insets. `summary` is the preset summary (as Today's, `features/today/PresetSummary.tsx`). Its `PopoverMenu` uses the Focus-window form with no Settings row and saves through `preset_select`. It is read-only while a session runs (C's rule, brief Q17).
- Data: `useTimer`-like subscription to `timer-tick` and `timer-milestone`, with the initial view from `timer_view`. `useTheme` (`apps/orasenda/src/app/useTheme.ts:15-35`). `clock-tick` for the clock and idle finish.
- Keys: Esc is always live (the component handles it; `singleKeys` never gates it). The host handles ⌘↩, which starts the saved preset with `custom: null`, and ⌘., which ends, as on Today. `singleKeys` is `false` until F adds the setting, so the caption reads "⌘. ends · Esc leaves" or "⌘↩ starts · Esc leaves" (`full-screen-focus.md:21`). `onExit` calls `focus_view_close`.
- A failed command shows its message in the component's status line, the same slot as "Session ended." A view that can't be read shows "Orasenda can't reach the timer. Close this window and try again." (ADR-013's failure line).

### Floater page (`floater.html`, `apps/orasenda/src/features/floater/`)
- Hosts `FloatingTimer`, with `data-tauri-drag-region` on its body (`floating-timer.md:5`). `onOpen` calls `main_show`. Start uses the saved preset with `custom: null`.
- Keys (host's, only with key focus): Space pauses, resumes or starts; Return calls `main_show`; Esc calls `focus_view_close`. They are panel-scoped, so they need no single-key setting (WCAG 2.1.4's focus exception).
- **Proof first:** the floater task starts with a hands-on check that Space, Return and Esc reach the webview while the class-swapped non-activating panel is key and Orasenda is not active. If they don't, a local `NSEvent` monitor in platform-macos handles those three keys for the floater and calls the same Rust commands. The floater stays usable by mouse either way.
- Context menu, nice to have (`contextmenu` → `native_menu_popup` in the floater): "Close floating timer", and "Start focus" while idle or ended. Close is also Esc and the tray's "Hide floating timer", and Start is the pill. If the popup can't show from the panel, the task drops it and records that on its issue.

### Command palette (main window, `apps/orasenda/src/app/palette/`)
Mounted fresh per `palette-open` or Pages "Commands…", only when no other modal is open (`command-palette.md:3,8`). `compact` follows `useWindowLayout`. The commands, filtered to those available now:

| Command | When | Shortcut | Runs |
|---|---|---|---|
| Start focus · <preset> <min> min | idle | ⌘↩ | `timer_start` (saved preset) |
| Just 2 minutes | idle | ⌘⇧↩ | `timer_start` quick |
| Pause session / Resume session | running / paused | — | `timer_pause` / `timer_resume` |
| End session | running or paused | ⌘. | `timer_stop` |
| Full screen, or Full screen on <name> per display | macOS | ⇧⌘F on the first | `focus_view_open` |
| Floating timer | macOS | ⇧⌘T | `focus_view_open` floater |
| Use preset: <name> <focus>/<break> | idle, one per preset not selected | — | the settings queue, as Today's popover |
| Go to Today … Settings | always | ⌘1–⌘6 | `navigate` |
| Theme: Match system / Light / Dark | the two not current | — | the settings queue |
| Turn notifications on / off | per the saved preference | — | the Settings page's toggle logic (`features/settings/notificationsToggle.ts`) |

The preset rows come from the same helper as Today's popover. D moves `CHOICES` (`PresetSummary.tsx:21`) into `features/today/presets.ts` as `presetChoices(settings, lengths)`, and the palette and the popover both call it.

## Behavior & edge cases
- **Several Focus windows:** one per display may be open at once. Choosing a display that already has one focuses it. ⌘⇧F targets the main window's display.
- **Main window hidden:** the Focus view button can't be pressed, but ⌘⇧F (from a Focus window or the floater) and the tray still work. `hasMainWindow` uses the hidden main window's last frame.
- **Floater open paths** (Focus view menu, ⌘⇧T, Focus menu, tray, palette) all hide `main`. Opening a Focus window hides nothing. Closing the floater never shows `main`; Open Orasenda does. A Dock click shows `main` and leaves the floater open.
- **Key focus:** the floater becomes key on open and on click, never by itself (never on a tick, a milestone or a display change). When it closes or resigns key, macOS returns key status to the previous app's window, because Orasenda was never activated.
- **Keys from the floater:** ⌘⇧F, ⌘⇧T and ⌘K are expected to reach the app menu while the panel is key and Orasenda is inactive. This is the first hands-on check, with a fallback under Open questions.
- **Session ends** while a focus view is open: the Focus window stays and shows "Session ended." and Start (`full-screen-focus.md:26`). The floater shows its ended state. Neither closes or jumps to `main`.
- **Leave dialog:** Esc or Leave opens "Leave full screen?". Only its confirm calls `focus_view_close`. The session keeps running (`full-screen-focus.md:19`).
- **Frame clamping:** a stored frame larger than the floater limits is clamped to them. A frame outside `visibleFrame` is moved inside, keeping its size. Drags write at most once per 500 ms (trailing) and once more on close.
- **Store degraded or a frame write fails:** the frame is logged and kept in memory for this run. The floater still opens (at its default frame if none is known). No line is shown, because nothing the user asked for failed.
- **Commands that don't apply** (pause while idle, close from `main`) return the existing typed errors and change nothing (ADR-013).
- **Reduced motion and themes:** the components already handle both. The Focus window and floater bodies use tokens only, and each window applies the theme through `useTheme`.

## Data & migrations
New migration `crates/store/migrations/000N_window_frame.sql`. N is assigned when it lands, because E (Session cadence) also adds a migration in parallel and whichever merges second takes the next number. The SQL holds no version number. Renumbering means renaming the file, changing its `MIGRATIONS` entry and bumping `SCHEMA_VERSION` (`crates/store/src/migrate.rs:6-14`, `crates/store/src/lib.rs:35`).

```sql
-- Device-only (ADR-012): window positions never sync and never write change_log.
CREATE TABLE window_frame (
    window     TEXT    NOT NULL,          -- 'floater'
    display    TEXT    NOT NULL,          -- display UUID
    x          INTEGER NOT NULL,          -- points from the display frame's left
    y          INTEGER NOT NULL,          -- points from the display frame's top
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (window, display)
);
```

- Repository `crates/store/src/repo/window_frames.rs`: `get(txn, window, display)`, `latest(txn, window, displays)` and `put(txn, window, display, frame)`. Its module doc marks it device-only, like `active_session.rs:1-2`. It has no UUIDv7 id, `created_at` or tombstone, like `active_session` (ADR-012 amendment, `docs/DECISIONS.md:175`).
- The pure clamp (`frame_within(stored, visible, min, max)`) and the default frame live in `crates/service` with the store calls (`crates/service/src/windows.rs`), so the app crate's adapter only parses and calls (`docs/conventions.md:66-68`).
- No backfill. An older database simply has no frames.

## Testing strategy
- **Rust (app crate):** window specs for the Focus window and floater (labels, page, decorations, sizes equal to the `floater-*` tokens); `focus_menu_entries` for 1, 2 and 3 displays (order, ⌘⇧F only on the main window's display, floater label); tray entries per state with displays and the floater flag; tray preset entries built from `preset_lengths()`; id namespaces disjoint; `on_close_requested` for `focus-*` and `floater`; a capability test per file (exact `windows` pattern list and exact permissions; `focus.json` and `floater.json` lack `timer_state` and `settings_set`); the manifest test (`lib.rs:157-167`); `native_menu_popup` targets the calling window.
- **Rust (service and store):** in-memory `window_frame` put/get/latest, no `change_log` rows after a put, migration from the previous version, the clamp and default-frame cases (off-screen, too large, removed display), `run_view` leaves `pending` and `listening` untouched. Clamp tests use rounded integer points with a display-relative top-left origin, and the bottom-left to top-left conversion has its own pure test.
- **Rust (platform-macos):** main-thread refusal and null-pointer refusal for each new `unsafe fn`, as in `overlay.rs`. AppKit behaviour itself is hands-on.
- **Vitest:** the Focus view button (items for one and several displays, the chosen id calls `focus_view_open`, an empty list hides it, failure line); palette commands per state and their order (start first, Pause and End first while running, per `command-palette.md:3`); Pages "Commands…"; Focus window and floater hosts (keys, `focus_view_close` only after the confirm, `main_show`, the context menu items per state, never calling `timer_state`). Count listen and unlisten calls yourself (`docs/common-issues.md:5`).
- **Playwright WebKit harness:** `layout.html` gains `?surface=focus|floater` against `mockIPC` (`apps/orasenda/src/dev/layout/layoutMain.tsx:9-10`). Focus window: 1280×720, 1920×1080, 390×844, 1440×900, 1000×440 and 360×240, each in focus, paused, idle, break, warning and ended, with and without insets. Floater: 280×56, 280×64 and 360×96 in running, paused, warning, break, deep, idle and ended. Both themes and reduced motion. Each asserts no scroll, controls inside the viewport, 44×44 targets and the focus ring.
- **Names and roles in code** (VoiceOver pass deferred to #326): "Focus view" button with `aria-haspopup`; "Full-screen focus" section; "Floating timer, <state>" group; palette dialog and combobox names.
- **By eye (owner, no screenshots in PRs), light and dark:** Today with the Focus view button at 360×240, 900×600 and 1440×900; the Focus window at 1280×720 and on the second display in idle, running, paused and ended; the floater at 280×56, 280×64 and 360×96 in running, paused, idle and ended on a light, mid-grey and dark wallpaper; the palette regular and compact.
- **Hands-on (two displays, "Displays have separate Spaces" on, then off):** Full screen on each display leaves the other usable; the menu bar and Dock stay drawn over the Focus window; the floater over a full-screen app's Space and across Space switches; clicking the floater keeps the other app frontmost; ⌘⇧F, ⌘⇧T and ⌘K from main, a Focus window and the floater; Space, Return and Esc on the floater; unplugging the display under a Focus window or the floater; the floater's frame per display after a relaunch; ⌘W on each window.

## Decisions
- **ADR-016 "Windows and surfaces"** (proposed here, in `docs/DECISIONS.md`; D's last task marks it accepted). It records the window model per surface, levels and collection behaviour, which keys live in native menus versus the webview, frame memory and per-window capabilities. It builds on ADR-004 (the panel technique), ADR-012 (device-only) and ADR-013 (surfaces subscribe).
- Relied on: ADR-010 (OS code in `crates/platform-macos`), ADR-014 (one settings chain per webview; `preset_select` keeps a second webview off it), ADR-015 (no component changes here).
- **CONTEXT.md:** adds Focus view, Focus window, Floater, Display, Window frame, Key focus without activation, Command palette.

### Shared with E
D and E run in parallel. These files are touched by both, so the plan sequences them (E's floater and Focus window task waits for D):

| File | D | E |
|---|---|---|
| `apps/orasenda/src-tauri/src/tray/menu.rs` (split by D first) | Full screen and floater items, Preset submenu from `preset_lengths()` | break and warning states, the preset library |
| `crates/service/src/api/settings.rs` (`preset_lengths`), `apps/orasenda/src/features/today/presets.ts`, `PresetSummary.tsx` | `presetChoices` read by Today, the palette and the tray | replaces the fixed presets and Custom with a library behind the same helpers |
| `apps/orasenda/src/features/today/Today.tsx` | Focus view button in the top-right cell | intent line, break and warning |
| `apps/orasenda/src-tauri/src/lib.rs`, `commands.list.rs`, `src/ipc/bindings.ts` (generated) | new commands and events | new commands and fields |
| `apps/orasenda/src-tauri/capabilities/main.json` and the capability tests in `lib.rs` | `displays_list`, `focus_view_open` | any new main commands |
| `crates/store/src/migrate.rs`, `crates/store/src/lib.rs` (`SCHEMA_VERSION`), `crates/store/migrations/` | `window_frame` | E's tables; the second to land renumbers |
| `apps/orasenda/src-tauri/src/menu/` | Focus menu | only if E adds menu items |
| `CONTEXT.md`, `docs/DECISIONS.md` | terms appended at the end of the table; ADR-016 | its own terms; ADR-017 onward |
| `features/focus/*`, `features/floater/*` (new in D) | hosts | E's last task adds its states and keys |

## FAQ
### Why not macOS native full screen?
With "Displays have separate Spaces" off, native full screen blacks out every other display, so the main window stops being usable next to the timer (critique F1, brief Q7). A borderless window at normal level covers only its display.

### Why are ⌘⇧F, ⌘⇧T and ⌘K native menu items rather than webview shortcuts?
They must work from three different webviews and while the main window is hidden. A native accelerator is one registration handled in Rust. A webview binding would be needed in every window and could fire twice alongside a menu item (brief Q23a).

### Why `timer_view` instead of `timer_state` in the new windows?
`timer_state` drains pending milestones (`crates/service/src/session/service.rs:61-62`). A floater opened at launch would take the `recovered` milestone that Today must show.

### Why `preset_select` instead of the settings queue in the Focus window?
ADR-014 makes `settingsQueue.ts` the single sender per webview, and it sends the whole object. Two webviews each echoing a whole object could undo each other's change. The tray already saves one field in Rust.

## Author's calls
These are not owner decisions; each can be changed at review.
1. Display key: the `CGDisplayCreateUUIDFromDisplayID` UUID string, stable across relaunches and rearrangement. Frames are stored in display-relative integer points.
2. The floater's default frame is the top-right of the main window's display's `visibleFrame`, inset `space-6`, at `floater-width × floater-height`. It reopens on the connected display with the newest stored frame.
3. Frame writes are at most once per 500 ms during a drag, plus one on close. A failed write is logged, kept in memory, and not shown.
4. Window labels are `focus-<display UUID>` and `floater`. Capability `focus.json` matches `focus-*`.
5. Every floater open path hides `main`. A Dock click shows `main` and leaves the floater open. Neither view reopens at launch.
6. The Focus menu goes after View. Its items are "Full Screen" (or a "Full Screen ▸" submenu), "Floating Timer" and "Commands…", in macOS title case. "Floating Timer" ⌘⇧T opens the floater or gives it key focus, and never hides it. Hiding is the tray toggle, Esc or the context menu.
7. Tray Full screen and floater items carry no accelerator text.
8. The default View › Enter Full Screen (native, main window) is left as Tauri provides it.
9. `singleKeys` stays `false` in the Focus window until F's setting exists. The floater's Space, Return and Esc work because they are panel-scoped.
10. The Focus window shows the preset summary with the Focus-window `PopoverMenu`, saving through a new `preset_select` command.
11. ⌘K is delivered by a new `palette-open` event with no pending slot. A ⌘K before the main webview listens is logged and dropped. An open modal in `main` makes ⌘K bring the window forward only.
12. Visible-frame insets reach the Focus window through its URL query and a `focus-insets` event.
13. A Focus window whose display disconnects closes. A floater on a disconnected display moves to the main window's display.
14. ⌘W closes a Focus window without the leave dialog (it is an explicit close).
15. `native_menu_popup` pops up in the calling window. It is granted to `main` and `floater` only.
16. Off macOS, `displays_list` returns `[]` and every focus-view entry point is absent.

## Open questions
1. Do key equivalents reach Orasenda's main menu while the non-activating floater is key and Orasenda is not the active app? If not, the same `NSEvent` monitor that the floater-keys fallback uses handles ⌘⇧F, ⌘⇧T and ⌘K and calls the same Rust commands. This is checked in the floater task's opening hands-on proof.
2. Does `CGDisplayCreateUUIDFromDisplayID` (or an equivalent) bind cleanly with the `objc2` crates already in the tree (ADR-010)? If not, fall back to `NSScreenNumber` plus `localizedName` as the key. This is checked in the platform task. Resolved in #354: it binds with a small `extern "C"` block (ColorSync and CoreFoundation, no new crate), and the UUID is the key; the old key is the fallback and the migration source.
3. Does WKWebView forward an unhandled ⌘K from the main window to the menu once only? It is expected to; a hands-on check in the menu task confirms it.

## Implementation status
Implemented. Each task landed as its own PR (plan: `docs/plans/2026-11-12-focus-views.md`).
- [x] Plan
- [x] D1 tray menu split (#332, PR #351)
- [x] D2 window frames, `run_view`, `run_select_preset` (#333, PR #355)
- [x] D3 AppKit windows (#334, PR #353)
- [x] D4 windows module and IPC contract (#335, PR #363)
- [x] D5 native menus and display changes (#336, PR #368)
- [x] D6 Focus window page (#337, PR #365)
- [x] D7 floater page and keys (#338, PR #366)
- [x] D8 Focus view button, Pages "Commands…", the palette, close-out (#339, PR #372)
- Hands-on checks still owed to the owner: the three open questions above, the VoiceOver pass (#326).
