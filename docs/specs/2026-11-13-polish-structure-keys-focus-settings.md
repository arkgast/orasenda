# Structure, keys, focus and Settings (P1 sub-project H) — Spec

- Status: draft
- Date: 2026-11-13
- Owner: Arnold Gandarillas Castillo
- Related:
  - Owner decisions at the spec gate and controller rulings on the Fable review (2026-11-13), recorded under [Decisions](#decisions).
  - ADRs: ADR-014 (settings), ADR-015 (code-first design system), ADR-016 (windows), ADR-017 (global shortcuts), ADR-018 (data portability); proposes ADR-019, ADR-020 and ADR-021 (this spec).
  - Earlier specs: [hotkeys and capture](2026-11-12-hotkeys-and-capture.md) (F), [focus views](2026-11-12-focus-views.md) (D), [session cadence](2026-11-12-session-cadence.md) (E, the intent line), [data portability](2026-11-12-data-portability.md) (G), [settings](2026-11-09-settings.md) (B), [structure refactor](2026-11-10-structure-refactor.md).
  - Issues: #419 (G8) and #420 (G9) become H6 and H7 and close as superseded. Follow-ups that fit: #438 (import cap test, with H3's import tests) and #439 (capture permission files, with H3).
  - Components: `ShortcutRecorder`, `ShortcutList`, `SettingsIndex`, `SettingsRow`, `FullScreenFocus`, `TimerRing`, `TimerStrip`, `IconButton`, `Tooltip`, `Dialog`, `PopoverMenu`; new `SettingsNav` and `DataTable` (design gate).

## TL;DR
- **H1 moves the frontend into five layers** (`surfaces → app → features → domain → shared`), imports only downward, enforced by Biome. Moves only; every test stays green with the same totals (ADR-021).
- **H2 removes the session intent** everywhere: the field after Start, the command, the engine field, the UI. A migration clears `focus_session.intent` and its `change_log` rows; the column stays unused.
- **H3 gives every action two bindings**, *In Orasenda* (an app-menu accelerator) and *Everywhere* (a global shortcut), from one registry in Rust (ADR-020). It first fixes three bugs: a new binding that silently doesn't take, a capture shortcut that does nothing, and a floater that can't go back.
- **H4 makes full screen the main window in native macOS full screen** (ADR-019). It enters at once, Esc leaves at once, and the "Leave full screen?" dialog goes.
- **H5–H7 rebuild Settings as master-detail panes.** H5 builds the shell, all seven pane ids, and General, Timer, Notifications and Shortcuts. H6 fills About and Your data, H7 fills Backups, with G's behaviour unchanged.

## Change in a nutshell
Settings after H5–H7, regular width:

```
 ┌──────────────┬──────────────────────────────────────────────────────────┐
 │ General      │ Shortcuts                                                  │
 │ Timer        │ [x] Use single keys (Space, P)                             │
 │ Notifications│                                                            │
 │▸Shortcuts    │ Full screen                                                │
 │ About        │ Full screen on this display                                │
 │ Your data    │   In Orasenda [ ⌘F    ]  Everywhere [ ⌃⌥⌘F ]  Registered   │
 │ Backups      │   Restore default                                          │
 │              │ Full screen on another display                             │
 │              │   In Orasenda [ ⇧⌘F   ]  Everywhere [ ⌃⌥⇧⌘F ] Registered   │
 │              │ Timer                                                      │
 │              │ Start or pause focus                                       │
 │              │   In Orasenda [ None  ]  Everywhere [ ⌃⌥⌘Space ] Registered│
 │              │ …                                                          │
 └──────────────┴──────────────────────────────────────────────────────────┘
```

Press ⌃⌥⌘F in any app. Orasenda's main window comes forward and goes native full screen on its display, showing only the timer. Press Esc and the window is back as it was. The other app stays behind it.

In general: one Rust registry lists every action and its two bindings. The menu bar, the global registrar, Settings and the palette all read it. Full screen is a state of the main window, not a window of its own. Settings shows one pane at a time beside a list that never scrolls away.

## Problem
- **The frontend has no boundaries.** `focus`, `floater` and `settings` import `features/timer` and `features/today` (`features/focus/FocusPage.tsx:9-13`, `features/settings/Settings.tsx:7-8`, `features/focus/cadenceActions.ts:4`). Six features import `app/` (`features/today/Today.tsx:3-5`, `features/board/BoardPage.tsx`, `features/capture/CapturePage.tsx`). A change to Today's presets can break full screen.
- **The intent step costs a step and is unused.** After Start, Today opens `IntentField` (`features/today/Today.tsx:22-23`), and the line is saved through `timer_set_intent` (`src-tauri/src/commands/timer.rs:78`). The owner wants a session to pick a Board task instead, later.
- **Keys are inconsistent and partly broken.** Only two shortcuts can be changed, only system-wide (`crates/service/src/api/keyboard.rs:8-22`). The menu keys are fixed (`src-tauri/src/menu/focus_menu.rs:22-24`). The palette repeats them by hand (`app/palette/paletteCommands.ts:43-76`). The owner reports three bugs (H3).
- **Full screen is a second window** with a display menu and a confirm dialog (`packages/ui/src/components/ui/full-screen-focus.md:21,30`; `features/today/FocusViewButton.tsx:23-38`). It takes three steps to enter and two to leave.
- **Settings is one long scroll** of six sections (`features/settings/SettingsHeader.tsx:6-26`), and G adds three more (`docs/specs/2026-11-12-data-portability.md:127-131`). Presets are a list with text Edit and Remove buttons.

## Goals / Success criteria
1. **H1:** every frontend file sits in one of the layers. `just lint` fails on a fixture for each forbidden import (feature → feature, feature → app, domain → feature, shared → anything above, and a relative `../` import that crosses a layer). Vitest and the layout specs pass with the same test counts as before H1.
2. **H2:** no code path reads or writes a session intent. After migration 0006, every `focus_session.intent` is NULL and no `change_log` row has `field = 'intent'`. Start goes straight to a running session with no further step.
3. **H3, bugs:** each of the three bugs has a failing test first, then a fix (baton:debug).
4. **H3, model:** every registry action can be rebound, cleared and restored in both slots. A rebound *In Orasenda* key shows in the menu bar and works in `main` and in the floater. A rebound *Everywhere* key works from another app. The full-screen actions are tested against today's behaviour (the focus window and display choice) until H4 swaps them. *(author's call, builder check)*
5. **H3, conflicts:** a chord already used by any binding, fixed key or app-menu item is refused with the action's name. A chord macOS never delivers is refused. A well-known chord asks once before it is used *Everywhere*.
6. **H3, compatibility:** a pre-H3 database or export file with `keys.start_pause` or `keys.capture` gives working bindings after launch or import, by the fold rule, and the post-import re-registration still runs.
7. **H4:** Today's Full screen button and the "this display" binding enter native full screen on the main window's display in one step. Esc leaves in one step when no overlay is open. The floater shows over it.
8. **H4:** key hints in full screen show for the first 3 entries, for 4 s each, then fade (instant under reduce motion), with no layout shift.
9. **H5:** each pane is its own view; the pane list stays in view at every Settings size. Every existing navigation target opens its pane and focuses its field.
10. **H6, H7:** About, Your data and Backups pass every webview case in the data-portability spec's testing strategy (`docs/specs/2026-11-12-data-portability.md:186`), now as panes.
11. **Every UI task:** tokens only, both themes, 4.5:1 text and 3:1 marks, a visible focus ring, VoiceOver names, hit targets from the design-system README, no red for time, no exclamation marks.

## Non-goals
- **A session picks a Board task.** H2 files an issue for the board sub-project; nothing is built here.
- **Search on Board.** ⌘F is full screen's default for now (FAQ).
- **Windows key handling.** The registry is cross-platform, but only macOS menus and registration are built and tested.
- **Detecting which app holds a global shortcut.** macOS doesn't say (spec F).
- **Behaviour changes in H6 and H7.** Copy, status lines, dialogs and store-unavailable rules are spec G's. Only the layout changes.
- **New Rust for data portability.** H6 and H7 use the G5 and G6 commands as built.
- **The *Apps and sites* placeholder** (spec B): H5 removes the section and the `appsAndSites` target (`src-tauri/src/ipc.rs:121` and the webview) until P5 adds a real pane (owner, 2026-11-13).
- **Returning to the previous app** after leaving a full screen entered from another app. Orasenda stays in front.
- **Screenshots in PRs.** The owner checks visuals by eye.

## Users & permissions
One local user. No roles.

| Window | Can (new in H) | Cannot |
|---|---|---|
| `main` | set and restore both bindings of every action; suspend shortcuts while recording; enter, move and leave full screen; read the registry | register shortcuts from JS (ADR-017) |
| `floater` | read the registry (`keyboard_state`); run the actions its keys name, through the one Rust entry point (H3) | change bindings or settings |
| `capture` | nothing new | read the registry or run other actions |
| `focus-*` | removed in H4 (ADR-019) | — |

Each capability file keeps its exact-list test.

## Tenancy & localization
n/a for tenancy. English only. Key glyphs and spoken names come from Rust (`Accelerator::describe` and `spoken`, `crates/service/src/keyboard/accelerator.rs`). Dates and sizes in H6 and H7 follow spec G (local time zone, `Intl`, 1 KB = 1000 bytes).

## Domain model

### H1: frontend layers (ADR-021)
| Layer | Holds | May import |
|---|---|---|
| `surfaces/<main\|focus\|floater\|capture>/` | each window's entry (`main.tsx`) only; the `.html` files point here; `*Page.tsx` roots stay in their features | everything below (the main entry mounts the `app/` shell) |
| `app/` | shell, routing, providers, `PageBoundary`, palette | features, domain, shared |
| `features/<name>/` | one screen or panel | domain, shared, its own files |
| `domain/<name>/` | code two or more features need | other domain folders, shared |
| `shared/` | `ipc/` (client, bindings, queues, subscribe), `hooks/`, `lib/`, `test/` (fixtures, builders, setup) | nothing above |
| `styles/` | `app.css`, the global stylesheet | outside the layers; imported by surfaces only, through `@styles/*` |

- Planned homes for today's shared code (H1 confirms by reading each import):
  - `domain/timer/`: `useTimer`, `useClock`, `useSurfaceTimer`, `format`, `commandFailure` (now in `today/statusLine.ts:109`; FocusPage uses only this from it).
  - `domain/presets/`: `presets.ts`, `PresetSummary`.
  - `domain/cadence/`: `cadenceOffers`.
  - `domain/keyboard/`: `useKeyboardView`, `useShortcuts`, `useSingleKeys` (H3 turns these into registry readers).
  - `domain/navigation/`: `PagesButton` (used by Board, Settings and Today).
  - `shared/hooks/`: `useTheme`, `useWindowLayout`.
  - `statusLine.ts` stays in `features/today/` (only Today uses its main export).
- Features get `components/`, `hooks/`, `model/` or `api/` only when they have 3 or more files of that kind. Small features stay flat.
- Tests sit next to their code. Tests, their `.support.tsx` files and everything under `shared/test/` (setup, fixtures) may import upward to render a surface, never sideways into another feature.
- `dev/` (spikes, `dev/layout/` scenarios) stays outside the layers and keeps its paths.
- Cross-layer imports use aliases (`@surfaces/`, `@app/`, `@features/`, `@domain/`, `@shared/`, `@styles/`); relative imports stay inside one layer folder.

### H2: no intent
`FocusSession` has no intent in core, service, IPC or UI. The SQLite column `focus_session.intent` stays, always NULL.

### H3: shortcut registry (ADR-020)
- **Action:** an entry in a static table in `crates/service/src/keyboard/registry.rs`: `id`, `label`, `description`, `group` (where it works: *Full screen*, *Timer*, *Capture*), `app_default`, `global_default`, and `single_key` (optional, for Space and P). The table's order is the registry order.
- **Binding:** a canonical accelerator (spec F's form) or empty.
  - *In Orasenda* needs ⌘ or ⌃.
  - *Everywhere* needs ⌘, ⌃ or ⌥ (`Accelerator::parse`, `accelerator.rs:107-109`). An ⌥-only chord is on the warning list (it types characters on most layouts).
- **Fixed keys:** registry entries that can't be rebound and count in conflict checks: ⌘K Commands, ⌘, Settings, ⌘↩ Start focus, ⇧⌘↩ Just 2 minutes, ⌘. End session, ⌘1–6 pages, Esc leaves full screen, and the app menu's standard items (⌘Q, ⌘H, ⌥⌘H, ⌘W, ⌘M, ⌘X, ⌘C, ⌘V, ⌘Z, ⇧⌘Z, ⌘A).
- **System keys:** one module, `keyboard/system_keys.rs`, with tests, holding two lists. Each entry has a plain reason.
  - *Never delivered* (refused in both slots): ⌘Tab, ⇧⌘Tab, ⌘Space and ⌃Space (input sources and Spotlight), ⌥⌘Esc, ⌃⌘Q, ⇧⌘3, ⇧⌘4, ⇧⌘5, ⌃↑, ⌃↓, ⌃←, ⌃→. Line: "macOS keeps this key, so it won't reach Orasenda."
  - *Well known* (warned before use *Everywhere*): ⌘Q, ⌘W, ⌘H, ⌘M, ⌘F, ⌘T, ⇧⌘T, ⌘N, ⌘C, ⌘V, ⌘X, ⌘Z, ⇧⌘Z, ⌘A, ⌘S, ⌘P, ⌘O, ⌘R, ⌘`, ⌥⌘Space, ⌃⌘Space, ⌃⌘F, and any ⌥-only chord. Example reason: "⌘W closes the window in most apps."
- **Defaults** (owner decision 3):

| Action (group) | In Orasenda | Everywhere |
|---|---|---|
| Full screen on this display (Full screen) | ⌘F | ⌃⌥⌘F |
| Full screen on another display (Full screen) | ⇧⌘F | ⌃⌥⇧⌘F |
| Leave full screen (Full screen) | none (Esc is a fixed key) | none |
| Floating timer, there and back (Timer) | ⇧⌘T | ⌃⌥⌘T |
| Start or pause focus (Timer) | none (Space is its single key) | ⌃⌥⌘Space |
| Capture a thought (Capture) | none | ⌃⌥⌘N |

- **Settings keys** (syncable, ADR-012, ADR-014): `keys.app.<action>` and `keys.global.<action>`, with `<action>` one of `full_screen`, `full_screen_other`, `leave_full_screen`, `floater`, `start_pause`, `capture`. The value is a canonical accelerator or `"off"`. A missing row means the default. Restore default writes an explicit row holding the default, as today (`crates/service/src/keyboard/service.rs:242`). `keys.single_key` stays as it is.
- **Legacy keys** `keys.start_pause` and `keys.capture` (spec F) are never written again. The fold rule reads them. The device-only `meta` flag `keys.legacy_folded` records that this device has folded them.
- **Status** per *Everywhere* binding: `registered | off | failed`, in memory only (ADR-017). *In Orasenda* bindings have no status. A slot the repair pass turned off carries `repaired: true`, kept in a device-only `meta` row (not synced) and shown on the row until the user changes that row. *(author's call, builder check)*

### H4: full screen (ADR-019)
- **Full-screen state:** `main`'s native full-screen state, read from AppKit's did-enter, did-exit and did-fail notifications. A `WindowView { fullScreen, display, hintsLeft }` event carries it to the webview, and a `window_view()` getter returns it on mount or reload.
- **Hint counter:** `hint.full_screen_keys`, a device-only `meta` row holding the number of full-screen entries that showed the hints, `"0"` to `"3"`. Rust bumps it on did-enter while it is under 3, so an entry counts even if the user leaves before 4 s; the webview never writes it. Device-only, like F's tip flags (`crates/service/src/session/tips.rs:14-20`): learning the keys happens on one Mac, and a count that changes on every entry would fill `change_log` for nothing *(author's call)*.

### H5: pane registry
- `features/settings/panes.ts` lists all seven panes in order: `{ id, name, file, targets }`. Ids: `general`, `timer`, `notifications`, `keyboard` (named "Shortcuts"), `about`, `data`, `backups`. H5 also adds the `data` and `backups` navigation targets.
- H5 builds General, Timer, Notifications and Shortcuts, and keeps About as it is today. `data` and `backups` render a placeholder pane file ("Coming in the next update.") *(author's call for the copy)*. H6 owns `panes/About.tsx` and `panes/YourData.tsx`; H7 owns `panes/Backups.tsx`. Neither edits `panes.ts`, so they run in parallel.

## Interfaces

### H1: React structure (first, alone)
- Moves only (`docs/conventions.md` rule 5), in two PRs landed back to back: H1a (aliases, Biome, lint fixtures, `shared/`, and the move-only splits of `test/fixtures.ts` and `dev/layout/scenarios.ts`), then H1b (`domain/`, features, `surfaces/` and `app/`). *(Amended by the controller's rulings on the plan review, 2026-11-13.)*
- **Allowed non-move edits:** the aliases (`tsconfig.json`, `vite.config.ts`, the vitest config) and rewriting imports to use them; splitting `commandFailure` out of `statusLine.ts` into `domain/timer/`; the `.html` entry paths; `biome.json`; `scripts/file-size-allowlist.txt` paths. Nothing else changes.
- `capture.html`, `floater.html`, `focus.html` and `index.html` point at `src/surfaces/<name>/main.tsx`.
- **Biome** (`noRestrictedImports` with `patterns`, Biome 2.6.6):
  - one `override` per layer banning the aliases above it and `@features/*` inside features;
  - depth-specific overrides banning relative imports that climb out of a layer folder (`features/*/*` bans `../**`, `features/*/*/*` bans `../../**`, and so on per layer). Patterns match the import string, and a later matching override replaces the options, so each override restates its full pattern list;
  - separate overrides for `**/*.test.ts(x)` and `**/*.support.tsx` (upward allowed, sideways into another feature still banned) and for `dev/` (free);
  - a `lint-fixtures/` folder (excluded from the build and from vitest), one forbidden import per rule, relative crossings included. `just lint-layers` (run by `just ci`) feeds each fixture to `biome lint --stdin-file-path=<its virtual path under src/>` and asserts Biome reports it.
- `docs/conventions.md` gains "Frontend layers": the table above, the alias rule, naming (`PascalCase.tsx` for components, `camelCase.ts` for logic and hooks, `<File>.<behaviour>.test.tsx` splits, `.support.tsx` for test helpers), and a pointer to the 500-line rule ("Code structure and size").

### H2: remove the session intent
Merges before H3; H3 rebases on it. Shared files: `features/today/Today.tsx`, `app/palette/*`, `apps/orasenda/src-tauri/src/lib.rs`, `capabilities/main.json`, `ipc/bindings.ts` (regenerated), `test/fixtures.ts`.
- **Webview:** delete `features/today/IntentField.tsx`, `intentEvents.ts`, their tests and `app/App.intent.test.tsx`; the intent step after Start in `Today.tsx`; intent lines in `statusLine.ts:19,74,230-242`, `TimeView.tsx:24` and `FloaterPage.tsx:124`; "Set intent" in `app/palette/paletteCommands.ts:53-54` and `Palette.tsx`; intent fields in `test/fixtures.ts`, `dev/layout/scenarios.ts` and `ui-types.test-d.tsx`. If the change pushes `Today.tsx` (377 lines) toward 500, it splits the start flow into `features/today/useStartFlow.ts`.
- **Rust:** `timer_set_intent` (`src-tauri/src/commands/timer.rs:78`, `lib.rs:40`, `commands.list.rs`, `capabilities/main.json`); `Engine::set_intent` (`crates/core/src/timer/engine/mod.rs:183`) and the intent in the engine view; `session_name` in `crates/core/src/timer/cadence.rs:83-85` stops using the intent; `set_intent` in `crates/service/src/session/actions.rs:236` and `TimerCommandError::InvalidIntent` (`crates/service/src/api/errors.rs:33`); the field in `crates/store/src/repo/focus_sessions.rs`, `portability/rows.rs:45,113,132` and `portability/merge/sessions.rs:16,34,63`.
- **packages/ui:** remove the `task` prop from `TimerRing`, `TimerStrip` and `FullScreenFocus` (components, tests, specimens, READMEs, including the "intent line" section of `full-screen-focus.md:9-14`) and from the layout scenarios (owner, 2026-11-13). The board sub-project re-adds a slot with its own design. The `body` token's sample copy ("Write the session intent before you start.", `tokens.json:75`) gets a neutral sample. Republish the artifact after merge (CLAUDE.md, ADR-015).
- **IntentPrompt stays.** `packages/ui` `IntentPrompt` is the P6 blocking overlay ("Is this what you intended?", `intent-prompt.md:1`), reused by ADR-004 and `dev/Overlay.tsx:106`. It is not the session intent.
- **Docs:** `docs/SPEC.md` and the ROADMAP row E say the intent line was removed in H2. Approved specs D and E are not rewritten; this spec supersedes their intent lines.
- **Issue:** "A session picks a Board task" for the board sub-project.

### H3: keys
**Step 1, debug** (baton:debug: reproduce, root cause, failing test, fix):
- **(a) A new binding doesn't take.** Reproduce with plain F, then with a chord. Known so far:
  - the recorder records nothing for a key without ⌘, ⌃ or ⌥ and keeps recording, with no message (`packages/ui/src/components/ui/shortcut-recorder.tsx:54`, README "Keyboard");
  - while recording, the app menu's accelerators and the registered global shortcuts still fire, so a chord that is already bound runs its action instead of reaching the recorder. This is the likely second cause.

  Fix: the recorder says "Add ⌘, ⌃ or ⌥. A single key can't be a shortcut." and keeps recording; and recording suspends shortcuts (below).
- **(b) The capture shortcut does nothing.** Find the key in use (default ⌃⌥N, `api/keyboard.rs:20`) and why. Candidates: VoiceOver holding ⌃⌥ keys; a `failed` status not shown; window creation from the blocking press thread (`shortcuts/plugin.rs:43-46`).
- **(c) Going back from the floater does nothing or crashes.** Known so far: ⇧⌘T "opens the floater or gives it key focus, and never hides it" (`menu/focus_menu.rs:53-55`), and the floater's webview hears only Space, Return and Esc (`windows/floater.rs:20-34`, `KEY_ROUTE = Webview`). The crash is not yet reproduced.

**Step 2, key-route spike** (task HS: a non-code controller task run before H3's action work; results written into the issues): does a menu accelerator reach the app while the non-activating floater is key? The answer picks exactly one route for the floater's chords:
- *Menu:* accelerators reach the app; the floater's webview binds no chord (ADR-016's "never also bound in a webview" holds).
- *Monitor:* they don't; the local `NSEvent` monitor (`crates/platform-macos/src/windows/keys.rs`, `KEY_ROUTE = Monitor`) handles the registry's *In Orasenda* chords while the floater is key, driven by the registry instead of its fixed table. The webview still binds no chord.

ADR-020 records whichever route wins. Until then, every toggle path (menu, monitor, global, tray, webview) goes through one Rust entry point, `actions::run(ActionId, Source)`, which drops a second request for the same action within 300 ms *(author's call for the window)*.

**Rust service (`crates/service/src/keyboard/`):**
- `registry.rs` (the table and fixed keys), `system_keys.rs`, `conflicts.rs` (uniqueness and repair) and `fold.rs` (legacy keys), so `service.rs` (343 lines) stays under 500.
- `ActionId` (the six actions) replaces `ShortcutId` (plan review, 2026-11-13). `Slot` is `app | global`.
- `keyboard_set_binding(id, slot, keys: string | null, confirmWarning: bool) -> Result<KeyboardView, KeyboardError>`. Order: parse → slot modifier rule → never-delivered list → clash → if `global` and on the warning list and not confirmed, return `Warning { reason }` → for `global`, register first (ADR-017) → save → unregister the old one or rebuild the menu item → emit `keyboard-changed`.
- `keyboard_restore_default(id, slot)` uses the same path. If another action now holds the default, it is refused with `InUse { action }`.
- `keyboard_recording(on: bool)`: `on` suspends every menu accelerator, standard items included (⌘Q, ⌘W, ⌘, and ⌘K), every global shortcut and the single keys, so any chord pressed reaches the recorder and gets its `InUse` or refusal line. `off` restores them. The webview calls `on` when a recorder starts and `off` on record, Esc, blur and unmount. Rust also restores them when `main` loses focus or closes, or its webview reloads. The suspension lives in memory only, so a relaunch always starts with shortcuts on. *(author's call, builder check)*
- `KeyboardError` gains `InUse { action: string }` (replacing `InUseByOrasenda`), `NeedsModifier { slot }`, `SystemKeeps` and `Warning { reason: string }`.
- `KeyboardView { actions: Vec<ActionView>, fixed: Vec<FixedKeyView>, singleKey, voiceOver }`. `ActionView { id, label, description, group, app: BindingView, global: BindingView & { status }, singleKey: string | null }`. `BindingView { keys, display, spoken, isDefault, repaired }`.
- **Fold rule** (`fold.rs`), at launch and after every import, before re-registration (`data/import.rs:25`, `data/files.rs:85`):
  - At launch it runs only while `keys.legacy_folded` is absent. For each legacy key present it writes `keys.global.<action>`: the old default (`Control+Alt+KeyF`, `Control+Alt+KeyN`) → no row (the new default applies); `"off"` → `"off"`; any other value → that value. Then it sets `keys.legacy_folded`. Legacy rows are never read again on this device.
  - After an import it runs again only if the imported file carried legacy keys and no `keys.app.*` or `keys.global.*` rows. It then folds the imported legacy values, which overwrite the current *Everywhere* bindings of those two actions.
- **Repair pass** (`conflicts.rs`), at load, after the fold, after every import, and later after sync. A fixed key always wins. Between slots, an explicit user-set row (folded custom legacy chords included) beats a default-valued slot; ties go by registry order, *In Orasenda* before *Everywhere*. *(author's call, builder check)* The loser is written `"off"` and marked `repaired`. One deterministic result on every device. It replaces any case-by-case clash rule.

**App crate:**
- **H3 → H4 bridge:** H3 adds every registry entry and routes the full-screen actions through `actions::run` to today's behaviour (the `focus-<display>` window and its display choice). It builds no throwaway UI and does not add Leave Full Screen to the menu; Esc stays in the focus window as today. H4 swaps the implementation behind the same action ids and adds Leave Full Screen. *(author's call, builder check)*
- **Menus** are built from the registry, in `menu/view_menu.rs` and `menu/window_menu.rs`. *View*: Full Screen, Full Screen on Another Display… (only with 2+ displays), and from H4 Leave Full Screen (enabled only in full screen). *Window*: Floating Timer. The existing *Focus* menu keeps Start or Pause Focus, Capture a Thought… and Commands… ⌘K *(author's call: the owner named View and Window; timer actions belong in neither)*. Rebinding calls `set_accelerator` on the item.
- Menu handlers always act on `main` (full screen) or on the floater, whatever window is key, and are ignored while `capture` is key.
- Tauri's default View › Enter Full Screen item (`tauri-2.12.5/src/menu/menu.rs:231-233`, used by `menu/app_menu.rs:86`) is replaced by ours.
- **Floater toggle:** floater hidden → open it and hide `main` (unless `main` is in full screen, which stays). Floater shown → close it and show and focus `main` as it was. The same binding does both, from `main`, from the floater and from another app, through `actions::run`.
- The tray's start and capture items show the *Everywhere* keys as inert text (ADR-017), from the registry.

**Webview:**
- `domain/keyboard/` reads `KeyboardView` and serves every consumer: `useShortcuts` (fixed keys), `useSingleKeys`, `todayKeys.ts`, the palette's `shortcut` hints, the full-screen hints and the settings rows. No glyph string for a binding is written in app code.
- **`ShortcutRecorder`** (packages/ui, README updated): label per slot ("Full screen on this display, in Orasenda"); calls `onRecordingChange(on)` so the host can suspend shortcuts; the modifier message; an optional `warning` with `quiet` "Pick another" then "Use anyway" (the safe choice first in focus order and initial focus); "None" for an empty slot. Messages go to a polite live region (`aria-live="polite"`) and stay linked by `aria-describedby`.
- **Lines** (copy, in the row):
  - `NeedsModifier`: "Add ⌘, ⌃ or ⌥. A single key can't be a shortcut." (*In Orasenda*: "Add ⌘ or ⌃.")
  - `SystemKeeps`: "macOS keeps this key, so it won't reach Orasenda."
  - `InUse`: "Orasenda uses this for <action>. Pick a different one."
  - `Warning`: "<reason> Use it everywhere anyway?"
  - `repaired`: "This shortcut was turned off because <action> uses it."
  - `Unavailable` or `failed`: "Another app uses this shortcut. Pick a different one." (spec F)
  - VoiceOver, while it is on: a ⌃⌥ binding keeps spec F's line "VoiceOver uses Control-Option keys. You may want a different shortcut."; a ⌃⌥⌘ binding shows "VoiceOver uses this key while it's on. Pick another to use both." (owner decision 10).
- Until H5, today's Keyboard section shows the two existing rows (start or pause, capture) with both recorders each. It is throwaway, so H3 keeps it minimal and adds no new layout.

**Single keys:** Space and P on Today, Space in full screen, behind `keys.single_key` (WCAG 2.1.4). Today's F single key goes with the display menu in H4.

### H4: full screen in the main window
- **Step 1, spikes** (task HS, with the key-route spike; a throwaway instrumented build driven by `osascript`, the owner by hand only if automation can't decide; results written into the issues before H4 starts):
  - Esc in native full screen: AppKit's `cancelOperation:`, which responder gets Esc after an *Everywhere* entry from another app, and whether an open palette or popover gets Esc first.
  - The floater over `main`'s native full-screen Space (`fullScreenAuxiliary`, ADR-016).
- **Rule for Esc:** an open overlay (palette, popover, dialog) consumes Esc first. Otherwise Esc leaves full screen.
- **Commands** (main and floater): `full_screen_enter()` (this display), `full_screen_enter_on(displayId)`, `full_screen_leave()`, `window_view()`. Webview toggles call `action_run`; only the palette's display commands call `full_screen_enter_on`. They use Tauri's `set_fullscreen`. `crates/platform-macos` only observes did-enter, did-exit and did-fail.
- **Sequencing:** one transition at a time. A request during a transition waits for it. A did-fail, or no notification within 3 s, ends the transition and keeps the state AppKit reports *(author's call for the timeout)*. Entering while `main` is hidden shows it first. Moving to another display waits for did-exit, moves, then enters.
- **Choose display:** with 2+ displays the binding, from anywhere (another app, the floater), shows and activates `main`, leaves the floater as it is, and opens the palette with only the "Full screen on <display>" commands. If `main` is already full screen, the palette opens over it. *(author's call, builder check)* With one display it acts as "this display".
- **Today:** the Focus view button and its native menu go (`FocusViewButton.tsx`, `focusView.ts`). Today shows two `IconButton`s with Tooltips naming their keys: *Full screen* (enters at once) and *Floating timer* *(author's call: the floater keeps a one-click path once the menu is gone)*. `Today.tsx` is split if it grows toward 500 (the start flow to `useStartFlow.ts`, the focus-view buttons to `FocusButtons.tsx`).
- **The view:** `main` hides `NavRail` and the page header and renders `FullScreenFocus`. Navigation keys (⌘1–6, ⌘,, palette pages) leave full screen first, then navigate. In a Split View tile the view gets a narrow width and uses its compact layout.
- **Leaving:** Esc (by the rule above) and the Leave `IconButton` leave at once. The `Dialog` "Leave full screen?", its tests and its README text go (`full-screen-focus.md:21-22`). The `scrim` token's usage drops "the full-screen exit confirmation". ⌘W or closing `main` leaves full screen, waits for did-exit, then hides `main`. Quit in full screen quits; the next launch opens `main` normally.
- **Hints:** the caption ("Space pauses · Esc leaves") is the hint. On entries 1 to 3 it shows for `duration-hint` (new token, 4 s, added in H4), then fades over `duration-slow`. Under reduce motion it disappears with no fade. Its row keeps its height after it fades, so nothing moves. From the 4th entry it doesn't show; Settings › Shortcuts is the reference. Tooltips on the buttons stay.
- **Layout:** Pause or Resume and End sit centred, vertically, in the space between the ring's bottom and the view's bottom, with a wider gap between them. The gap token is `space-8` (owner pick 5A): round Pause or Resume and an End `IconButton`. `full-screen-focus.md` (Anatomy and fixed tracks, `:3-7`) and the FullScreenFocus layout spec (`verification/layout/fullScreenFocus.spec.ts`, scenarios in `dev/layout/`) follow; `focusWindow.spec.ts` goes with the window.
- **Design rules for H4** (the pipeline's `designRules` argument for the task): "Full screen is `main` in native full screen with no nav rail or page header. Controls are centred between the ring's bottom and the view's bottom, with the gate's gap token between Pause and End. No leave dialog. Hints show on the first 3 entries only, keep their row height after fading, and never animate under reduce motion. Tokens only; both themes."
- **Removed:** `focus.html`, `capabilities/focus.json`, `surfaces/focus/`, the `focus-<display>` window code in `src-tauri/src/windows/` and `crates/platform-macos/src/windows/focus_window.rs`.
- **Tips:** F's Focus view tips (`statusLine.ts`, "F key opens Focus view…") read their keys from the registry and drop the F key.

### H5: Settings shell and first four panes
- **Shell:** master-detail. A sticky side list (`SettingsNav`, new, designed at the gate) of pane names; the selected pane fills the rest and scrolls inside its own `ScrollRegion` only if it must. The list never scrolls away.
- **`SettingsNav` accessibility:** a `nav` landmark ("Settings") holding a list of buttons; ↑ and ↓ move between them, Home and End jump, Tab leaves the list; the current pane's item has `aria-current="page"`. The tab-strip option uses the same model with ← and →.
- **Pane change:** with the pointer, focus stays on the nav item. With the keyboard (Enter or Space), focus moves to the pane's heading. The pane's scroll position resets to the top.
- **Compact width:** a sticky horizontal tab strip (owner pick 1B): `SettingsNav` with `orientation="horizontal"`, the current tab underlined in `focus` and marked `aria-current`, ← and → move. When the names don't fit, the strip scrolls sideways and shows edge buttons ("Earlier panes", "More panes") that are not tab stops. The pane title and the save line stay put; only the rows scroll.
- **Opening:** Settings opens on General unless a target says otherwise *(author's call)*.
- **Timer pane:** presets in `DataTable` (new): Name, Focus, Break, Long break, Rounds, then `IconButton` Edit and Remove with Tooltips ("Edit Steady Focus", "Remove Steady Focus"). No text Edit or Remove. *Add preset* and *Restore defaults* sit below. The editor and its rules stay as E built them. `DataTable` takes columns and row actions as props, so H7 reuses it.
- **Shortcuts pane:** the single-key switch at the top, then every registry action grouped by `group`. Each row: description, the two recorders, the *Everywhere* status as a word ("Registered", "Off", "Not available"), the repaired line if any, Restore default. Fixed keys follow in a read-only `ShortcutList`.
- **Apps and sites:** `sections/AppsAndSites.tsx`, its index entry and the `appsAndSites` target go (owner, 2026-11-13).
- **Targets:** each `SettingsTarget` (`src-tauri/src/ipc.rs:115-127`, gaining `data` and `backups`, losing `appsAndSites`) opens its pane and focuses its field:

| Target | Pane | Focus |
|---|---|---|
| `general`, `timer`, `notifications`, `keyboard`, `about` | that pane | pane heading |
| `focusMinutes`, `breakMinutes` | Timer | the selected preset's Edit button |
| `keepGoing` | Timer | *Keep going automatically* checkbox (`settingsTarget.ts:8-14`) |
| `data`, `backups` | Your data, Backups | pane heading |

### H6: About and Your data
As `docs/specs/2026-11-12-data-portability.md` (Webview, Behavior & edge cases, Other cases), as panes:
- **About:** version; "Your data stays on this Mac. Orasenda doesn't use the network."; the licence line.
- **Your data:** counts, data folder with *Show in Finder*, *Export data…*, *Import data…* with their status lines, and *Delete all data…* alone at the end with its destructive `Dialog` (`critical` on the confirm only). Uses the G5 and G6 commands and fixtures. No Rust change.

### H7: Backups
As spec G: *Back up* frequency (Every month, Every 3 months), *Keep the newest* N (1–50, `NumberField`), *Last backup* with *Back up now*, then the backup list in `DataTable`: date, kind as a word, size, `IconButton` Restore and Delete with Tooltips, the count and total size. "From a newer Orasenda" rows have Restore disabled. The empty state, the Restore `Dialog` (not destructive, `loading`, the unreadable-store body) and the Delete-backup `Dialog` (destructive) are G's. `backups-changed` refreshes the pane.

### Design gate (before H4–H7 code; in parallel with H2 and H3)
**Picked (owner, 2026-11-13): 5A, 4A, 3A, 2A, 1B** on the canvas https://claude.ai/artifact/JYkKXMP83i1PdK1RG16Fw3.
- **Settings (1B):** wide: NavRail, sticky `SettingsNav` list, one pane whose title and save line stay put. Compact: the tab strip above.
- **Table (2A):** `DataTable` as a ruled table: header row, hairline rows, `IconButton` row actions at the row end, a footer line with the count and size; the presets' selected preset is a radio in the Name cell. Backups reuse it (disabled Restore with its reason line on "From a newer Orasenda"; the empty state).
- **Shortcuts (3A):** two columns: the name, description and one Restore default on the left; the *In Orasenda* and *Everywhere* recorders on the right; the status as a word ("Registered", "Not available", "Not saved yet"). Needs a `ShortcutRecorder` warning state (the reason plus Pick another and Use anyway), "None" for an empty slot, a per-slot accessible name, and Restore default optional per recorder.
- **Your data (4A):** *Delete all data…* is the last row after a hairline, as a ghost button; `critical` only on the Dialog's confirm.
- **Full screen (5A):** round Pause or Resume and an End `IconButton`, `space-8` between them, centred below the ring; the hint row keeps its 18px height after fading.
- **New icons:** edit, delete (trash) and restore join `Icon`.
- **Copy from the concepts** *(author's call; the owner did not object)*: "Everything Orasenda keeps is on this Mac.", "Shows only the timer, on the display Orasenda is on.", "Shortcuts are paused while you record.", "⌘T opens a new tab in most apps.".

A hard block: no H4–H7 code starts before the owner picks (owner's brief). The controller runs Claude Design (Artifact quickstart, intent "design"); the picked concepts are recorded in this spec by amendment. *(author's call, builder check)* Two or three concepts each, light and dark, through Claude Design on the Orasenda design system: the Settings layout (regular and both compact options), the presets table (and the same table as the backup list), the Shortcuts pane (two bindings per row), the Your data pane, and the full-screen layout. New components or variants (`SettingsNav`, `DataTable`) are designed there, then built code-first in `packages/ui` with READMEs as their own tasks, ahead of H4 and H5 in Wave 2 *(author's call, builder check)*. The owner picks.

## Behavior & edge cases
- **Conflicts:** a chord is unique across both slots of every action, every fixed key and the app menu. A clash names the holder. The same chord in both slots of one action is refused too.
- **System keys:** never-delivered keys are refused in both slots. Well-known keys warn only for *Everywhere*; *In Orasenda* takes them unless a fixed key holds them (⌘F is a default).
- **Recording:** while a recorder records, no shortcut fires, standard menu items included. Leaving the field in any way, closing the window or relaunching restores them.
- **Esc in full screen:** a fixed key, not a binding, so the modifier rule holds for every editable slot *(author's call: the owner listed Esc as the In Orasenda default; it is kept, but as a fixed key)*. An open overlay takes Esc first.
- **Full screen and the floater:** entering full screen leaves the floater as it is; it floats over the full-screen Space. Floater toggle from full screen opens or closes the floater and leaves `main` in full screen.
- **Full screen from another app:** the *Everywhere* binding activates Orasenda, shows `main` and enters full screen. Leaving it keeps Orasenda in front.
- **A display is unplugged while full screen:** macOS moves the window; Orasenda stays in full screen on the remaining display.
- **Store unavailable:** binding changes return `Store` and show "Orasenda can't save this shortcut right now." (spec F). Registered shortcuts keep working.
- **Import while bindings are custom:** settings merge by key and later `updated_at` (spec G), then the fold (if it applies), then the repair pass, then re-registration. A binding that fails to register after import shows `failed`.
- **VoiceOver:** VoiceOver uses some VO-⌘ chords (VO-⌘-F, VO-⌘-T and VO-⌘-Space are likely among them), so a ⌃⌥⌘ default may not reach Orasenda while VoiceOver is on. The VoiceOver line shows on those rows (owner decision 10); the VoiceOver pass (#326) confirms which chords clash.
- **Reduce motion:** native full-screen transitions follow the system setting. Hints disappear without a fade. Nothing else in H animates.

## Data & migrations
- **0006 (H2):** `UPDATE focus_session SET intent = NULL;` and `DELETE FROM change_log WHERE entity = 'focus_session' AND field = 'intent';` (owner: intents "just disappear"). No new `change_log` rows. `SCHEMA_VERSION` becomes 6 (`crates/store/src/lib.rs:42`). Export and import stop reading and writing intent. An older file imported later is migrated in its temporary copy (spec G), so its intents are cleared there too. No backups exist yet, so there is no other compatibility case.
- **H3:** no schema change. New setting keys with defaults; the device-only `meta` flag `keys.legacy_folded`.
- **H4:** one device-only `meta` key, `hint.full_screen_keys`; one token, `duration-hint`.
- **H5–H7:** none.

## Testing strategy
- **H1:** test counts before and after are equal (vitest and Playwright list them); each Biome fixture, relative crossings included, fails lint; tests, `.support.tsx` and `dev/` pass under their overrides; `just file-size` passes.
- **H2:** store: 0006 nulls every intent and deletes the intent `change_log` rows; export rows and merge carry no intent; an older fixture with intents imports with NULL. Core and service: no intent API (compile); `session_name` without intent. Webview: Start runs with no step (Today tests updated, the intent tests deleted). Layout scenarios without intent.
- **H3:**
  - each bug's failing test first (recorder with plain F; a bound chord while recording; the capture press path; floater toggle both ways);
  - recording suspends every menu accelerator (standard items included), global shortcut and single key, and restores them on blur, unmount, window close and relaunch (fake registrar);
  - `actions::run` drops a duplicate within the window and runs one after it;
  - registry: unique ids; every default parses, follows its slot's modifier rule, is unique, and is on neither system list for *Everywhere*;
  - `keyboard_set_binding` per slot: invalid, `NeedsModifier`, `SystemKeeps`, `InUse` (other action, same action's other slot, fixed key, menu item), `Warning` then confirmed, register-before-save with a failing fake registrar, restore default (including a default held by another action), clear;
  - fold: old default → no row; `"off"` → `"off"`; custom → kept; flag set; fold, restore default, relaunch → the restored default stays; import of an old file after the fold → its legacy values fold in; import of a file with new-model rows → no fold;
  - repair: a user-set slot beats a default-valued one; two user-set slots with one chord → the later in registry order is `"off"` with `repaired` (device-only, cleared when the row changes); a slot holding a fixed key → `"off"`; same result run twice;
  - import of a pre-H3 file (fixture with `keys.start_pause = Control+Alt+KeyG`) → start or pause *Everywhere* is ⌃⌥G and registered after re-registration; #438's case joins these tests;
  - menu model from the registry, accelerator rebuilt on rebind; handlers ignored while `capture` is key;
  - palette hints and single keys read the registry (vitest); recorder live-region messages and focus order.
- **H4:** platform: enter, leave, move-to-display, did-fail and timeout sequences behind a fake observer; ⌘W waits for did-exit. Webview: Esc leaves at once with no overlay and closes only the overlay when one is open; no dialog; hints on entries 1–3 only (an entry left before 4 s still counts), gone after 4 s, no fade under reduce motion, no layout shift; navigation leaves full screen first; compact layout at Split View widths. Layout: `fullScreenFocus.spec.ts` with the new controls position.
- **H5:** each pane renders alone; the list stays in view at every Settings size (layout); `SettingsNav` arrows, `aria-current`, focus on pointer versus keyboard change, scroll reset; each target opens its pane and focuses its field; placeholder panes for `data` and `backups`; `DataTable` with 1 and 12 presets; Shortcuts rows for every registry action.
- **H6, H7:** spec G's webview and layout cases, moved to panes.
- **Hands-on (owner):** both themes; VoiceOver on and off with every ⌃⌥⌘ default; every default *Everywhere* binding from another app; the floater over Orasenda's full screen; choose display with two displays; Split View; "Displays have separate Spaces" off.

## Decisions
- **Owner, 2026-11-13 (spec gate):**
  1. Layers `surfaces → app → features → domain → shared` (order amended by the controller, 2026-11-13: the main entry mounts the shell); subfolders only on demand; tests beside code; fixtures in `shared/test/`; layout scenarios stay in `dev/layout/`.
  2. A `domain/` layer for shared domain code; features never import each other; enforced in Biome.
  3. *Everywhere* defaults on ⌃⌥⌘ (avoids the plain ⌃⌥ VoiceOver keys; see 10); *In Orasenda* defaults ⌘F, ⇧⌘F, ⇧⌘T; start or pause on Space; capture none; Esc leaves full screen. Legacy values: old default → new default, custom → kept as *Everywhere*, `"off"` → empty, also on import.
  4. Native macOS full screen on `main`; choose display leaves, moves and enters; the floater shows over it.
  5. Full-screen hints: 4 s then fade, first 3 entries, counter stored by the app.
  6. Settings compact width: the tab strip (pick 1B, 2026-11-13).
  7. Intent goes entirely; 0006 nulls the column and removes its `change_log` rows; export and import drop it.
  8. The `task` prop leaves `TimerRing`, `TimerStrip` and `FullScreenFocus` in H2; the board sub-project re-adds it with its own design.
  9. H5 drops the Apps and sites section and its `appsAndSites` target until P5.
  10. VoiceOver: the ⌃⌥⌘ defaults stay even though some are VO-⌘ chords. While VoiceOver is on, each affected *Everywhere* row shows "VoiceOver uses this key while it's on. Pick another to use both." The VoiceOver pass (#326) confirms which chords clash.
- **Controller rulings on the Fable review, 2026-11-13:** the table name `focus_session`; the fold flag and import rule; one repair pass in registry order; the floater key-route spike with one route and a de-duplicating entry point; the Esc spike and overlay-first rule; shortcuts suspended while recording; menu handlers target `main` and ignore `capture`; `set_fullscreen` with observe-only platform code; the full-screen sequencing cases; never-delivered keys refused; *In Orasenda* needs ⌘ or ⌃; relative-import bans and test, support and `dev/` overrides; the wave and file-ownership rules below; the accessibility rules for `SettingsNav`, the recorder and hints; design rules as the pipeline's `designRules`.
- **ADR-019** (new): full screen is `main` in native full screen. Amends ADR-016.
- **ADR-020** (new): two bindings per action, one registry. Amends ADR-016 (Keys) and ADR-017.
- **Controller rulings on the plan review, 2026-11-13:** surfaces sit above `app/`; `shared/test/**` is under the test override; H1 is two PRs; the three spikes are one non-code task (HS); the hint counter is bumped by Rust on did-enter and read through `WindowView.hintsLeft` and `window_view()`.
- **ADR-021** (new): frontend layers and import direction.
- **ADR-018** is marked accepted (G is built).
- **Order and ownership:**
  - Wave 0: H1 (H1a, H1b) alone. Whether HD, HS and Rust-only or `packages/ui`-only tasks may run during Wave 0 is pending the owner (plan).
  - Wave 1: H2, H3 and the design gate. H2 merges first; H3 rebases on it (shared files listed under H2).
  - Wave 2: first the `packages/ui` tasks for the gate's new components (`SettingsNav`, `DataTable`, variants); then H4 and H5 in parallel. H4 owns `Today`, the full-screen view and `duration-hint` in `tokens.json`; H5 owns `features/settings/` and any other `tokens.json` additions. Both touch `packages/ui/src/index.ts` (append-only exports). H4 merges first when both add tokens; the other rebases. The artifact is republished after each merge.
  - Wave 3: H6 and H7 in parallel, each owning only its pane files.
- **CONTEXT.md:** *In Orasenda binding*, *Everywhere binding*, *shortcut registry*, *fixed key*, *never-delivered key*, *well-known key*, *fold rule*, *repair pass*, *pane*.

## FAQ
### Why not keep the second full-screen window, given ADR-016's reason against native full screen?
The second window costs a page, a capability, frame logic and a dialog, and it took three steps to enter. The case it protected, "Displays have separate Spaces" off, is not the macOS default, and there the other displays only go blank while full screen lasts. ADR-019 accepts that.

### Why is Esc a fixed key and not the In Orasenda binding of Leave full screen?
Every editable slot needs a modifier, so a bare key can't take typing elsewhere. Esc is the macOS way out of full screen and acts only there. A user who wants a chord too can set one in the slot.

### Why does ⌘F start full screen when it is the usual Find key?
Orasenda has no search today. If Board gains search, full screen's *In Orasenda* default moves.

### Why keep `IntentPrompt` when the brief says to remove it?
It is the P6 blocking overlay, not the session intent: "Is this what you intended?" before a blocked app (`intent-prompt.md:1`, ADR-004). Removing it would undo ADR-004's chosen UI.

### Why a repair pass instead of refusing duplicates on import?
Import and sync write settings directly, so two bindings can meet that no single save would allow. Walking the registry in order gives every device the same answer, and the row says what happened.

### Why a device-only counter for the hints?
Learning the keys happens on one Mac, and syncing a count that changes on every entry would add `change_log` rows for nothing. F's tip flags made the same choice.

## Open questions
1. **Bug (b) and the crash in (c):** root causes are not yet known; the debug step may change H3's scope.

## Implementation status
Updated by the PRs that implement this spec.
- [ ] Plan and backlog
- [ ] H1 React structure (H1a, H1b move-only PRs)
- [x] H2 Remove the session intent
- [ ] H3 Keyboard layer and bugs (debug, key-route spike, then the model)
- [x] Design gate (Settings, presets and backup table, Shortcuts pane, Your data, full screen): 5A 4A 3A 2A 1B
- [ ] H4 Full screen in the main window (Esc and floater spikes first)
- [ ] H5 Settings shell, seven pane ids, first four panes
- [ ] H6 About and Your data (supersedes #419)
- [ ] H7 Backups (supersedes #420)
