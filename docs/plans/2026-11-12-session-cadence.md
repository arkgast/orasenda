# Session cadence (P1 sub-project E) — Implementation Plan

- Spec: [docs/specs/2026-11-12-session-cadence.md](../specs/2026-11-12-session-cadence.md) (approved by the owner 2026-11-12, amended the same day with opt-in auto-continue)
- Date: 2026-11-12
- Status: draft

## Overview
Eleven tasks, one PR each. The spec outlined seven; three more come from the 500-line rule and the four-hour ceiling: the move-only engine split (E2), and the preset library and the cadence each cut into a core task and a service task, because both reshape types that every layer reads. The eleventh, E11, is the owner's ruling: the break actions join `FullScreenFocus` and `FloatingTimer` in a code-first design-system PR.
- **Foundations, in parallel with D's first wave:** the preset library's core types and store (E1), the engine's move-only folder split (E2), the break suggestions and their source check (E3).
- **The preset switch (E4), alone:** the `Preset` enum and Custom go; `Settings`, `StartRequest`, `TimerView`'s preset fields, `presets_list`, seeding, the Today popover and the tray's Preset submenu move to the library. Every later D and E task that names a preset builds on it (the owner's ruling: the library goes first).
- **Then, in parallel:** preset editing (E5) and the cadence engine (E6), beside D4.
- **The cadence service and IPC (E7)**, beside D6 and D7.
- **Surfaces:** Today's states and the intent line (E8), then the menu bar, notifications and the Settings rows for the cadence (E9).
- **Any early slot:** the break actions on `FullScreenFocus` and `FloatingTimer` (E11, `packages/ui` only).
- **Last:** the floater and full-screen states, "Set intent" in the palette, and the close-out (E10), after D6, D7 and D8.

E builds no new design-system component or token (spec Non-goals). E11 extends two existing components (owner ruling); E8 and E9 change two READMEs (InlineNotice "Today slots", MenuBarTimer glyph table).

## Contract
- **E4** owns the preset contract: `Settings` (every new key at once, so its shape changes once), `StartRequest { quick }`, `TimerView`'s `presetId`, `presetName`, `quick`, `breakMin` (replacing `preset`), `PresetEntry`, `PresetError`, `presets_list` (replacing `presets_get`), the `presets-changed` event.
- **E5** adds the preset write commands (`preset_add`, `preset_update`, `preset_remove`, `preset_undo_remove`, `presets_restore_defaults`) and `PresetPatch`.
- **E6** adds `"break"` to `Phase` (in `TimerView.phase`).
- **E7** owns the cadence contract: `Mode` `break | warning`, the new `TimerView` fields, `MilestoneKind` and `MilestoneEvent` additions, `timer_extend`, `timer_set_intent`, `timer_dismiss_offer`, `timer_take_break`, the `extensionCap` and `invalidIntent` error kinds.

Each contract task regenerates `apps/orasenda/src/ipc/bindings.ts`, updates `apps/orasenda/src/test/fixtures.ts` and the layout `scenarios.ts`, lists each command in `commands.list.rs` and grants it in `capabilities/main.json`. E5, E8, E9 and E10 build against these bindings.

## Impact
- **Migration (E1):** `000N_preset_library.sql` (N at landing): creates `preset`, adds nullable snapshot columns and `break_kind` to `focus_session`, `DELETE FROM active_session`, inserts `meta('preset_seed','pending')`. Additive (expand). The contract step is E4's: old rows keep their `preset` text; new rows write `quick` or `library`. Forward-only; rollback is deleting `~/Library/Application Support/com.veloud.orasenda` (dev data, no users).
- **The `Preset` enum and Custom (E4):** call paths in core (`timer/mod.rs`, the engine), service (`api/{settings,timer}.rs`, `session/{settings,actions,view,run}.rs`, every test helper that builds a `Settings` or a `StartRequest`), the app crate (`commands/presets.rs`, `ipc.rs`, `tray/menu/*`, `runtime/events.rs`), the webview (`Settings.tsx`, `sections/Timer.tsx`, `settingsKeys.ts`, `settingsQueue.ts`, `Today.tsx`, `presets.ts`, `PresetSummary.tsx`, `useNextMinutes.ts`) and D's `run_select_preset` (D2). A pre-E4 `active_session` snapshot no longer decodes and the app starts idle (`recovery.rs:37-38`).
- **Settings object:** still `deny_unknown_fields`; a page and a Rust build of different shapes never meet (one PR). `timer.custom` stays stored, unread.
- **IPC:** `TimerView.preset` removed; `Mode` and `Phase` gain values (any exhaustive TS switch must handle them); four timer commands and six preset commands added; `presets_get` removed (D's `focus.json` must grant `presets_list`, see Shared with D).
- **Design system (E11):** `FullScreenFocus` and `FloatingTimer` gain optional props; existing callers (D6, D7, the specimens) are unchanged until E10 passes them. The controller republishes the artifact after E11 merges.
- **Tray:** the Preset submenu reads the library (E4); glyphs and items per state (E9). The threading contract (`tray/mod.rs` doc) stays.
- **Store:** `Entity::Preset`; `focus_sessions::insert` writes `intent`, `break_kind` and the snapshot; `started_between` reads today's rows.
- **Must stay green:** `cargo test` for core, store, service and the app crate; Vitest for Today, Settings, `settingsQueue`, App; `just layout`; the bindings check; `just file-size`; `just mobile`.
- **Interim states on `main` (dev builds only):** after E6 and before E7 a break shows as `mode: focus` and every break is short (round 1); after E7 and before E9 the end notification keeps its old copy and the tray draws a break with the focus glyph. Each is gone when the next task lands.
- **Rollout and rollback:** each task is one squash-merged PR, revertible after its dependants. E4's revert also reverts E5–E10.

## Dependency graph
```
E1, E2, D1, D2 ──> E4 ──┬──> E5 ──────────────> E9 ──┐
                        └──> E6 ──> E7 ──┬────> E9   ├──> E10
                             E3 ────┘    └────> E8 ──┘
E11 (independent) ──> E10
cross:  E4 ──> D4, D6     D6 ──> E8 ──> D8     D5 ──> E9     D6, D7, D8 ──> E10
```
Can start immediately: E1, E2, E3, E11 (with D1 and D3 the budget is three: see the wave table).

Cross-sub-project edges: E4 needs D1 (tray split) and D2 (it adapts `run_select_preset`); D4 needs E4; D6 needs E4; E8 needs D6 and lands before D8 starts; E9 needs D5; E10 needs D6, D7, D8 and E11.

## Combined D + E waves (at most 3 pipelines)
| Wave | Runs at once | Starts when |
|---|---|---|
| 1 | D1, D3, E1 | now |
| 2 | D2, E2, E3 | a W1 slot frees (none of them needs W1, except the budget) |
| 3 | E4, E11 | E1, E2, D1 and D2 merged (E4); a slot (E11). E4 is the only contract task: it changes the types D4, D5, D6 and D8 are spelled in. If D3 still runs, the three are D3, E4, E11 |
| 4 | D4, E5, E6 | E4 merged (D4 also D1–D3) |
| 5 | D6, D7, E7 | D4 merged (D6 also E4); E6 and E3 merged (E7) |
| 6 | D5, E8 | D4 (D5); E7 and D6 (E8) |
| 7 | D8, E9 | D5, D6, D7 and E8 (D8); D5, E5 and E7 (E9) |
| 8 | E10 | D6, D7, D8, E8, E9, E11 |

A slot freed early takes the next ready task in table order. No two tasks in one wave own the same file; the append-only files below are the controller's at landing.

## Shared with D
| File | E task | D task | Rule |
|---|---|---|---|
| `src-tauri/src/tray/menu.rs` → `tray/menu/{mod,entries,commands,native}.rs`, `tray/tests/menu_items.rs` | E4 (Preset submenu), E9 (states) | D1 (move), D5 | E4 and E9 start after D1 merges and edit its new files. E4 lands before D5 starts; E9 starts after D5 merges. D5's "Preset submenu from `preset_lengths()`" bullet and `tray_presets_from_preset_lengths` are done by E4 (`preset_lengths()` is gone); D5 keeps E4's submenu. |
| `crates/store/migrations/`, `src/migrate.rs`, `src/lib.rs` (`SCHEMA_VERSION`, `repo` re-export) | E1 | D2 | Number assigned at landing: whichever lands second renames its file, its `MIGRATIONS` entry and `SCHEMA_VERSION`. Each migration test builds "the schema before this migration" from `MIGRATIONS`, not a literal version. |
| `crates/service/src/session/{run.rs,service.rs,mod.rs}`, `session/tests/view_select.rs` | E4, E5, E7 | D2 | D2 lands before E4 starts. E4 changes `run_select_preset(host, preset: Preset)` to `(host, id: PresetId)` and its tests. Other lines are append-only. |
| `commands/focus_views.rs` (`preset_select`), `capabilities/{focus,floater}.json` | E10 | D4 | D4 starts after E4 and spells `preset_select(presetId: PresetId)` and `allow-presets-list`. E10 adds the timer grants its states need. |
| `features/today/{presets.ts,PresetSummary.tsx}` and tests | E4, E8 | D6 | Sequential: E4 (W3), D6 (W5), E8 (W6). D6's `presetChoices(settings: Settings, presets: PresetEntry[])`; D8's `paletteCommands` input takes `presets: PresetEntry[]`. |
| `features/today/{Today.tsx,today.css,statusLine.ts,statusLine.test.ts}` | E4 (start request), E8 (status row, summary, time view) | D8 (top-end cell, one status line) | Never concurrent: E4 (W3), E8 (W6), D8 (W7) rebases on E8. |
| `src-tauri/src/lib.rs`, `lib_tests.rs`, `commands.list.rs`, `commands/mod.rs`, `ipc.rs`, `capabilities/main.json` | E4, E5, E7, E10 | D1, D4, D5 | Append-only registration lines and exact-list capability tests; the controller resolves them at landing. |
| `apps/orasenda/src/ipc/bindings.ts` | E4, E5, E6, E7 | D4 | Regenerated after every rebase, never hand-merged. |
| `src/test/fixtures.ts`, `src/dev/layout/{scenarios.ts,scenarios.test.ts}` | E4–E9 | D4 | Append-only; E4 and E7 also change the `TimerView` and `Settings` builders. The controller resolves. |
| `app/palette/paletteCommands.ts` and tests | E10 ("Set intent") | D8 | After D8 merges. |
| `features/focus/*`, `features/floater/*`, `verification/layout/{focusWindow,floaterWindow}.spec.ts` | E10 | D6, D7 | After D6, D7 and D8 merge; E10 adds the break and warning cases D leaves out (D ruling 2). |
| `crates/platform-macos/src/lib.rs` | E9 (`mod` line) | D3 | Append-only; never concurrent (W1 vs W7). |
| `CONTEXT.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` | E10 | D8 | E10 after D8; append at the end. E's terms are already in `CONTEXT.md` (spec PR). |
| `verification/contrast-pairs.json`, `packages/ui/src/designSystem.test.ts` (export count), `packages/ui/src/index.ts`, `packages/ui/src/types.ts` | E11 (only if touched) | none planned | Append-only; the controller resolves. |
| `packages/ui/src/components/ui/{full-screen-focus,floating-timer}.*`, `verification/layout/{fullScreenFocus,floatingTimer}.spec.ts` | E11 | none (D6, D7 consume) | E11 adds optional props only, so D6 and D7 build unchanged; E10 passes them. |

## Notes for every task
- **Checks:** implementers (sonnet) run only fast checks: `cargo test -p <crate>`, `pnpm --filter orasenda test` and `typecheck`, `just file-size`, `just mobile` for any Rust change, and their own Playwright specs. The controller runs the full `baton verify` at landing. Each task sets `CARGO_TARGET_DIR=target/e<N>`.
- **Visuals:** no screenshots in PRs. Each UI task lists, under "Not yet verified", the states and sizes the owner checks by eye in light and dark. VoiceOver is deferred to #326; names and roles are asserted in code (`getByRole` with names, `toMatchAriaSnapshot`).
- **Registration:** a task that adds a command, an event, a `Host` method or a managed type lists `lib.rs`, `commands.list.rs`, `commands/mod.rs` and the fakes in `session/tests/support/` in Owns or Touches.
- **Sizes today** (`wc -l`): `timer/engine.rs` 344, `engine/tests.rs` 407, `timer/mod.rs` 297, `store/src/tests.rs` 439, `repo/focus_sessions.rs` 207, `session/tests/{actions 410, recovery 426, run 337, settings 253}.rs`, `session/settings.rs` 227, `session/view.rs` 73, `scheduler/publish.rs` 153, `tray/menu.rs` 352 (D1 splits it), `tray/render.rs` 245, `tray/tests/menu_items.rs` 324, `lib.rs` 348, `Settings.tsx` 467, `Settings.timer.test.tsx` 277, `sections/Timer.tsx` 141, `Today.tsx` 262, `statusLine.ts` 72, `PresetSummary.tsx` 141, `presets.ts` 104. New tests go in new files wherever a test file is above 300.

## Tasks

### E1: Preset library: core types and store
- Priority: 0
- Depends on: none
- Owns: `crates/core/src/timer/preset.rs` and `timer/preset/tests.rs` (new); `crates/store/migrations/000N_preset_library.sql`, `crates/store/src/migrate.rs` (entry), `crates/store/src/lib.rs` (`SCHEMA_VERSION`, re-export); `crates/store/src/repo/presets.rs` and `repo/presets/tests.rs` (new), `repo/mod.rs`; `crates/store/src/txn.rs` (`Entity::Preset`); `crates/store/src/repo/focus_sessions.rs` (`started_between` only) and `repo/focus_sessions/tests.rs` (new, if the inline tests would pass 300).
- Touches: `crates/core/src/timer/mod.rs` and `crates/core/src/lib.rs` (`pub mod preset;` and re-exports only).
- Interfaces:
  - Produces: core `PresetId(pub String)` (serde transparent, specta); `DefaultPreset { GentleStart, SteadyFocus, DeepWork }` (snake_case); `PresetDef { id: PresetId, name: String, focus_min: u16, break_min: u16, long_break_min: u16, rounds: u8, default_key: Option<DefaultPreset> }`; `default_presets() -> [PresetDef; 3]` (the spec's fixed ids); `PresetDef::validate(&self) -> Result<(), PresetInvalid>`, `PresetInvalid { field: PresetField }`, `PresetField { Name, FocusMin, BreakMin, LongBreakMin, Rounds }`; `normalize_name(raw: &str) -> Option<String>`; `SessionPreset { Library { id, name, focus_min, break_min, long_break_min, rounds }, Quick }` with `focus_ms()`, `break_ms(long: bool)`, `rounds()`.
  - Produces: store `presets::{list(txn: &Txn) -> Result<Vec<StoredPreset>, StoreError>, list_with_removed(txn: &Txn), get(txn: &Txn, id: &PresetId) -> Result<Option<StoredPreset>, StoreError>, insert(txn: &mut Txn, preset: &StoredPreset), update(txn: &mut Txn, preset: &StoredPreset) /* logs changed fields only */, remove(txn: &mut Txn, id: &PresetId), undelete(txn: &mut Txn, id: &PresetId)}`, `StoredPreset { def: PresetDef, position: u32, deleted_at: Option<u64> }`; `focus_sessions::{started_between(txn: &Txn, from_ms: u64, to_ms: u64) -> Result<Vec<SessionRow>, StoreError>, SessionRow { id, preset: String, phase: String, break_kind: Option<String>, started_ms, ended_ms, focused_ms, end_reason: String }}`.
- Acceptance:
  - [ ] Validation edges: focus 4/5/180/181, break 0/1/60/61, long 4/5/90/91, rounds 0/1/8/9; names trimmed, 1–40 characters, only spaces refused; uniqueness is the service's.
  - [ ] The migration applies on the schema just before it, built from the `MIGRATIONS` list (ruling 6), clears `active_session`, adds the marker, keeps old `focus_session` rows readable (`fifty_ten` included).
  - [ ] `insert`, `update` and `remove` log `change_log` rows with entity `preset` (one per changed field; a tombstone is `deleted_at`); `list` excludes removed rows and orders by `position`.
  - [ ] `started_between` excludes deleted rows and returns start order.
- Tests first: `preset_validation_edges`, `normalize_name_trims_and_refuses_blank`, `default_presets_fixed_ids`, `preset_library_migrates_from_previous_schema`, `preset_update_logs_only_changed_fields`, `preset_remove_is_tombstone`, `started_between_excludes_deleted_in_start_order`.
- Notes: sonnet. No existing type changes here; the switch is E4's. `store/src/tests.rs` is at 439: nothing new goes there.

### E2: Move-only split of the engine and its tests
- Priority: 0
- Depends on: none
- Owns: `crates/core/src/timer/engine.rs` → `timer/engine/{mod.rs (Session, start, pause, resume, stop), advance.rs (advance, elapsed, planned end), view.rs (view, planned_end_ms, is_idle, phase)}`; `timer/engine/tests.rs` → `timer/engine/tests/{mod.rs (support), lifecycle.rs, advance.rs, view.rs}`.
- Touches: none.
- Interfaces: none; every public path stays the same.
- Acceptance:
  - [ ] `git diff -M --stat` shows moves; no line changes except `use`, `mod` and visibility.
  - [ ] `cargo test -p orasenda-core` passes with the same test count before and after (both pasted).
  - [ ] Every new file ≤ 250 lines, so E6 has room.
- Tests first: none new (move-only).
- Notes: haiku or sonnet. A refactor PR moves code or changes it, never both.

### E3: Break suggestions: the list, the pick, the source check
- Priority: 1
- Depends on: none
- Owns: `crates/core/src/timer/suggestions.rs` and `timer/suggestions/tests.rs` (new); the spec's Break suggestions table and Open question 3 (`docs/specs/2026-11-12-session-cadence.md`, those lines only).
- Touches: `crates/core/src/timer/mod.rs` (`pub mod suggestions;` only).
- Interfaces:
  - Produces: `Suggestion { text: &'static str, label: Option<SuggestionLabel> }`, `SuggestionLabel { Optional, Experimental }` (camelCase), `BreakFor { Short, Long }`, `pick(kind: BreakFor, n: usize) -> &'static Suggestion`, `Suggestion::line(&self) -> String` ("Optional: look at something far away.").
- Acceptance:
  - [ ] **Verification first:** for each of the six "to verify" lines, the PR body gives a source the author opened (title, URL, what it tested) or keeps the line labelled Optional or Experimental, or drops it. No unlabelled line rests on an unverified claim; the spec table's Basis column is updated to match.
  - [ ] `pick` rotates by `n mod len` over the lines for that kind; short and long counted separately; both lists are non-empty.
  - [ ] Labelled lines read with the label as a first word and the rest lower-cased as the spec shows; no exclamation marks.
- Tests first: `pick_rotates_per_kind`, `pick_short_never_returns_long_only`, `labelled_line_starts_with_label`, `every_line_ends_with_period_no_exclamation`.
- Notes: opus for the source check (judgement), sonnet for the code. `BreakFor` keeps E3 independent of E6's `BreakKind`; E7 maps one to the other.

### E4: Preset library: the switch (service, IPC, menu bar, webview)
- Priority: 0
- Depends on: E1, E2, D1, D2
- Owns:
  - core: `timer/mod.rs` (removes `Preset`, `CustomSpec`, `PresetSpec` and their tests), `timer/engine/*` and its tests (`Session` carries `preset: SessionPreset`; `start(id, preset: SessionPreset, now_ms)`), `crates/core/src/lib.rs`
  - store: `repo/focus_sessions.rs` (`insert` writes `preset` `quick`/`library` and the snapshot columns)
  - service: `api/{settings.rs,timer.rs,mod.rs,tests.rs}`, `api/presets.rs` (new), `session/presets.rs` (new: cache, seeding, `list`, `resolve`), `session/{settings.rs,actions.rs,view.rs,run.rs,service.rs,mod.rs}`, `session/tests/{support/*,presets_seed.rs (new),presets_list.rs (new)}` and the existing service and scheduler tests that build a `Settings` or a `StartRequest`, `session/tests/view_select.rs` (D2's), `scheduler/host.rs` (`emit_presets_changed`)
  - app crate: `commands/presets.rs`, `commands/timer.rs`, `ipc.rs`, `runtime/{events.rs,ticker.rs}`, `tray/menu/{mod.rs,entries.rs,commands.rs}`, `tray/mod.rs` (`presets_changed`), `tray/tests/menu_items.rs`, `tray/tests/presets.rs` (new), `commands.list.rs`, `capabilities/main.json`, `lib.rs`, `lib_tests.rs`
  - webview: `ipc/bindings.ts` (regenerated), `ipc/{settingsQueue.ts,settingsQueue.test.ts}`, `test/fixtures.ts`, `dev/layout/scenarios.ts`, `features/settings/{Settings.tsx,settingsKeys.ts,sections/Timer.tsx,Settings.timer.test.tsx}`, `features/today/{Today.tsx,presets.ts,presets.test.ts,PresetSummary.tsx,PresetSummary.test.tsx,useNextMinutes.ts,Today.start.test.tsx}`
- Touches: `apps/orasenda/src/features/settings/customRange.ts` (kept: E5's editor reuses its ranges), `crates/store/src/repo/settings.rs` (read), `apps/orasenda/src/ui-types.test-d.tsx`.
- Interfaces:
  - Consumes: E1's `PresetId`, `PresetDef`, `default_presets`, `SessionPreset`, `presets::*`.
  - Produces: `Settings { theme, preset_id: PresetId, extension_cap: u8, auto_continue: bool, longest_focus_min: u16, deep_cap_on: bool, deep_cap_hours: u8, notify_session_end: bool, notify_two_minutes: bool }` (keys and defaults as the spec); `StartRequest { quick: bool }`; `TimerView { preset_id: Option<PresetId>, preset_name: Option<String>, quick: bool, break_min: Option<u32>, … }` (no `preset`); `PresetEntry { id, name, focus_min, break_min, long_break_min, rounds, is_default, is_changed }`; `PresetError { kind: PresetErrorKind, field: Option<PresetField>, message: String }`, `PresetErrorKind { Invalid, DuplicateName, Limit, LastPreset, NotFound, Unavailable, Write }`; command `presets_list() -> Vec<PresetEntry>`; event `presets-changed` (`Vec<PresetEntry>`); `session::run_presets_list<H: Host>(host: &H) -> Vec<PresetEntry>`; `Host::emit_presets_changed(&self, presets: &[PresetEntry])`; `NativeSurface::presets_changed(&self, presets: &[PresetEntry])`; `run_select_preset<H: Host>(host: &H, id: PresetId) -> Result<(), TimerCommandError>`; TS `presetName(entry)`, `summaryText(input)` reading entries.
- Acceptance:
  - [ ] A fresh database lists Gentle Start 15/5/15/4, Steady Focus 25/5/15/4, Deep Work 90/15/30/2, Steady Focus selected; seeding runs once, in one transaction, only while the marker is pending, maps `classic`, `deep_block`, `fifty_ten` ("50/10", 50/10/20/4) and `custom` ("Custom", break × 3, after 4) as the spec says, a converted preset placed after the three defaults (ruling 4); absent → Steady Focus.
  - [ ] A failed seed is owed and retried like spec A's owed reads; meanwhile the core defaults show read-only. The retry runs the normal path's effects: `presets-changed`, `settings-changed`, and the tray's re-render.
  - [ ] An unknown or removed `timer.preset` is presented as the first live preset and logged; Start uses it.
  - [ ] A session keeps its snapshot; `TimerView.presetName` is the snapshot name or "Just 2 minutes"; `breakMin` the snapshot's break; the running heading reads "<name> · <focus> / <break>".
  - [ ] Start sends `{ quick }` only, from Today, ⌘↩, ⌘⇧↩ and the tray.
  - [ ] Today's idle popover lists every live preset with meta "25 / 5" and the link row "Edit presets in Settings"; the tray's Preset submenu lists "Steady Focus 25 / 5" etc., the selected one checked, then "Edit presets in Settings…".
  - [ ] Settings › Timer shows one `Choice` radio per live preset (meta "25 / 5 · long 15 after 4"); the Custom fields are gone; choosing saves `presetId` through `settingsQueue`. Every file ≤ 500 lines.
  - [ ] Bindings regenerated; `presets_get` and `PresetLength` gone; `allow-presets-list` granted to `main`.
- Tests first: `seed_fresh_database_three_defaults`, `seed_maps_each_old_preset`, `seed_runs_once`, `seed_retry_emits_presets_and_settings_changed`, `unknown_preset_id_presents_first_live`, `start_snapshots_preset`, `edit_after_start_leaves_snapshot`, `view_preset_name_quick`, `select_preset_takes_library_id`, `tray_preset_submenu_from_library`, `start_sends_quick_only`, `popover_lists_library_presets`, `settings_timer_radios_from_library`.
- Notes: sonnet, opus review. The largest task: most of it is mechanical (every `Preset::Classic` in tests becomes a library id). The service cache holds the live presets; `view` and `clock_tick` resolve the selected one from it. Seeding runs in `session/presets.rs`, after the store opens and before the first view (spec Data & migrations). By eye (owner): Settings › Timer and the Today popover at 360×240, 900×600, 1440×900; the tray submenu; light and dark.

### E5: Preset editing: commands and Settings › Timer list and editor
- Priority: 1
- Depends on: E4
- Owns: `crates/service/src/session/presets.rs` → `session/presets/{mod.rs,edit.rs}` (split if it would pass 500), `session/tests/presets_edit.rs` (new), `api/presets.rs` (`PresetPatch`), `session/run.rs` (the `run_preset_*` functions), `commands/presets.rs`; `features/settings/sections/{PresetList.tsx,PresetEditor.tsx,Timer.tsx}`, `features/settings/{usePresets.ts,Settings.presets.test.tsx}` (new), `features/settings/Settings.tsx` (mounts the list; any move to stay ≤ 500 goes into `usePresets.ts`), `features/settings/settingsKeys.ts` (save-line copy); `verification/layout/settings.presets.spec.ts` (new).
- Touches (append-only): `commands.list.rs`, `commands/mod.rs`, `capabilities/main.json`, `lib.rs`, `lib_tests.rs`, `ipc.rs`, `ipc/bindings.ts` (regenerated), `test/fixtures.ts`, `dev/layout/scenarios.ts`.
- Interfaces:
  - Consumes: E4's `PresetEntry`, `PresetError`, `presets-changed`, `emit_presets_changed`.
  - Produces: `preset_add() -> Result<PresetEntry, PresetError>`; `preset_update(id: PresetId, patch: PresetPatch) -> Result<PresetEntry, PresetError>` with `PresetPatch { name, focus_min, break_min, long_break_min, rounds }` (each `Option`); `preset_remove(id)`, `preset_undo_remove(id)`, `presets_restore_defaults()`, each `-> Result<Vec<PresetEntry>, PresetError>`, the live list (ruling 3).
- Acceptance:
  - [ ] Add adds "New preset" with Steady Focus's lengths at the end and opens its editor with focus on Name; at 12 *Add preset* is `aria-disabled` with "Up to 12 presets.".
  - [ ] Remove tombstones; the last live preset's Remove is `aria-disabled` with "At least one preset stays."; removing the selected one selects the lowest `position` and says so; *Undo* restores, or answers `duplicateName` with the spec's line.
  - [ ] Restore un-tombstones and rewrites defaults at their positions (shifting others), leaves user presets alone, may pass 12; `aria-disabled` with "The default presets are all here." when nothing differs; `isChanged` false for user presets.
  - [ ] The editor saves each field on blur or Return and restores on Esc, with always-visible range helpers; duplicate names and blank names give the spec's lines; every write emits `presets-changed`, and `settings-changed` when the selection moves.
  - [ ] While a session runs, edits apply to the next session (B's line). Store degraded: the list is read-only with B's lines.
  - [ ] `settings.presets.spec.ts`: the editor open and 12 presets at 360×240, 900×600, 1440×900, both themes: no document scroll, targets ≥ 44×44, focus ring.
- Tests first: `add_at_twelve_is_limit`, `remove_last_is_last_preset`, `remove_selected_selects_first`, `undo_remove_name_taken_is_duplicate`, `restore_defaults_positions_and_past_twelve`, `update_logs_changed_fields_only`, `editor_saves_on_blur_and_return`, `editor_escape_restores`, `editor_saves_chain_newest_wins` (two held replies), `presets_changed_from_tray_updates_list`.
- Notes: sonnet. The commands call `orasenda_service::session::run_preset_*` through `AppHost` directly; `runtime/session.rs` is D4's in this wave and stays untouched. By eye (owner): the list, the editor open, Remove and Undo, at the three sizes, light and dark.

### E6: Cadence engine (core)
- Priority: 0
- Depends on: E2, E4
- Owns: `crates/core/src/timer/engine/{mod.rs,advance.rs,view.rs}` and new `engine/{breaks.rs,extend.rs,auto.rs}`; `engine/tests/{breaks.rs,extend.rs,auto.rs,sleep.rs}` (new); `crates/core/src/timer/cadence.rs` and `timer/cadence/tests.rs` (new); `timer/mod.rs` (`Phase::Break`, `BreakKind`, `Milestone`, `SessionRecord`, `EngineView`); `crates/store/src/repo/focus_sessions.rs` (`insert` writes `intent`, `break_kind`); `crates/service/src/session/{actions.rs,persist.rs,recovery.rs}` (compile-level adaptation only: loop over milestones, persist several records, round 1, `auto: None`); `ipc/bindings.ts` (regenerated: `Phase`).
- Touches: `crates/service/src/session/tests/*` (records with the new fields), `apps/orasenda/src/test/fixtures.ts` (append-only).
- Interfaces:
  - Produces: `Phase { Focus, Break }`; `BreakKind { Short, Long }`; `Milestone { Started, Paused, Resumed, Warned, BreakStarted, Extended, Ended(Vec<SessionRecord>), RollOn }`; `Session::start(id: SessionId, preset: SessionPreset, round: u8, now_ms: u64) -> Result<(), TimerError>`; `advance(&mut self, now_ms: u64, auto_longest_ms: Option<u64>) -> Vec<Milestone>`; `extend(&mut self, now_ms: u64) -> Result<Milestone, TimerError>`; `take_break(&mut self, now_ms: u64) -> Result<Milestone, TimerError>`; `set_intent(&mut self, intent: Option<String>, now_ms: u64) -> Result<(), TimerError>`; `stop(&mut self, now_ms: u64) -> Result<Vec<SessionRecord>, TimerError>`; `SessionRecord { +preset: SessionPreset, break_kind: Option<BreakKind>, intent: Option<String> }`; `EngineView { +break_kind, extensions, intent, warned, auto_step, open_focus: bool }`; `cadence::{DaySession { quick: bool, phase: Phase, break_kind: Option<BreakKind>, started_ms, ended_ms, focused_ms, completed: bool }, next_round(today: &[DaySession], now_ms: u64, long_break_ms: u64) -> u8, focused_today(today: &[DaySession], live_ms: u64) -> u64, local_day(now_ms: u64, offset_min_at: impl Fn(u64) -> i32) -> (u64, u64)}`; `session_name(intent: Option<&str>) -> &str`.
- Acceptance:
  - [ ] Every core case in the spec's Testing strategy passes with injected `now_ms`: break and long break at round N for each default; warning exactly once, again after an extension, never for ≤ 2:00; extension from the warning and from a break (gap excluded, break row `stopped`); `quick` → no break, no warning; auto-continue (steps to the limit, none when focus ≥ limit, `take_break`, End in a step is `stopped`, no step at a paused end, sleep across several steps, quick rolls on); sleep across a focus end and its break end (two records, planned ends, one milestone each, no warning); stop in focus and in a break.
  - [ ] The row invariant `ended − started = focused + paused_total + cut breaks` holds in every test that ends a focus.
  - [ ] `next_round` ignores quick and stopped, resets after a started long break, after a gap of `long_break + 1 ms` but not exactly `long_break`; `local_day` gives 23 and 25 hours on DST days; `session_name(None) == "Deep focus"`.
  - [ ] Arithmetic saturates (a clock set back never panics). Every file ≤ 500 lines.
- Tests first: `break_starts_at_planned_end`, `long_break_at_round_n_each_default`, `warning_once_per_end`, `extend_from_break_records_stopped_break`, `auto_steps_to_limit_then_break`, `auto_none_when_focus_at_limit`, `sleep_across_focus_and_break_two_records`, `stop_in_break_completes_focus`, `next_round_resets_after_gap_not_at_gap`, `next_round_clock_set_back_no_panic`, `local_day_dst_23_and_25_hours`, `session_name_fallback`.
- Notes: sonnet, opus review. The cap check, the round and `auto` come from the service (E7). Until E7 lands, a break shows as `mode: focus` and every break is short (Impact, interim).

### E7: Cadence service and IPC
- Priority: 0
- Depends on: E6, E3
- Owns: `crates/service/src/session/cadence.rs` (new: today's rows via `started_between`, `next_round` input, `focused_today`, the cap line and `capReached`, the keep-going offer, `auto` from settings, the midnight tick), `session/{actions.rs,view.rs,service.rs,recovery.rs,persist.rs,run.rs,mod.rs}`, `session/view/` split if `view.rs` would pass 300; `session/tests/{cadence.rs,extend.rs,offer.rs,cap.rs,view_modes.rs,two_row_end.rs,recovery_break.rs}` (new); `api/{timer.rs,events.rs,errors.rs}`; `scheduler/tick.rs` (midnight `timer-tick`); `commands/timer.rs`; `ipc/bindings.ts`.
- Touches (append-only): `commands.list.rs`, `commands/mod.rs`, `capabilities/main.json`, `lib.rs`, `lib_tests.rs`, `ipc.rs`, `test/fixtures.ts` (the `TimerView` builder), `dev/layout/scenarios.ts`; `scheduler/publish.rs` (only if the new milestones need routing; notifications are E9's).
- Interfaces:
  - Consumes: E6's engine and `cadence::*`; E3's `pick`; E4's settings keys.
  - Produces: `Mode { Focus, Break, Warning, Paused, Idle }`; `TimerView { +break_kind, extensions, can_extend, intent, suggestion: Option<SuggestionView { text, label }>, offer: Option<Offer>, check_in, cap_line }`; `MilestoneKind { +Warned, BreakStarted, Extended, CapReached }`, `MilestoneEvent { +phase, quick }`; `Action { +Extend, SetIntent(Option<String>), DismissOffer, TakeBreak }`; commands `timer_extend`, `timer_set_intent(intent: Option<String>)`, `timer_dismiss_offer`, `timer_take_break`, each `-> Result<TimerView, TimerCommandError>`; `TimerCommandErrorKind { +ExtensionCap, InvalidIntent }`; `Effects { +warned, break_started, quick_completed }` for E9.
- Acceptance:
  - [ ] `mode` derived only in `view.rs`, as the spec says; `canExtend` at caps 0–3, never for `quick`, not in focus while auto-continue is on, hidden while paused; `offer` never while auto-continue is on; `checkIn` while running in an auto step.
  - [ ] Each start (a keep-going start included) computes the round from today's rows, the `unsaved` records and the open focus; `focused_today` counts stopped and quick.
  - [ ] `capReached` fires once, at the end milestone of the crossing session; not on relaunch; `capLine` while idle; the midnight `timer-tick` fires once when `capLine` changes and once when the offer clears.
  - [ ] The focus row is written when its break ends, with the break row, in one transaction; a failed write keeps both in `unsaved`, retried once each, never duplicated.
  - [ ] Recovery: a running break restored in time continues; a break that ended during a quit writes both rows and shows `recovered`; a crash mid-break writes the open focus from the snapshot. A snapshot restored inside the last 2:00 keeps `warned` and does not warn again.
  - [ ] `timer_set_intent` trims, collapses inner whitespace, ≤ 120 characters (`invalidIntent`), empty → NULL; `wrongState` in a break or idle. Races answer `wrongState`/`extensionCap`.
  - [ ] Bindings regenerated; four commands listed and granted to `main`, `timer_take_break` included (ruling 2).
- Tests first: `view_mode_each_phase`, `can_extend_caps_zero_to_three`, `round_counts_unsaved_and_open_focus`, `cap_reached_once_on_crossing`, `cap_line_midnight_tick_once`, `offer_lifecycle`, `auto_continue_hides_extend_and_offer`, `two_row_end_write_fails_keeps_both_unsaved_once`, `recovery_mid_break_continues`, `relaunch_in_warning_does_not_warn_again`, `set_intent_trims_and_limits`, `suggestion_rotates_per_day_kind`.
- Notes: sonnet, opus review. Split tests by behaviour; `actions.rs` and `recovery.rs` tests are at 410 and 426.

### E8: Today: cadence states and the intent line
- Priority: 1
- Depends on: E7, D6
- Owns: `features/today/{statusLine.ts,statusLine.test.ts,StatusRow.tsx,StatusRow.test.tsx,IntentField.tsx,IntentField.test.tsx,intentEvents.ts,Controls.tsx,TimeView.tsx,Today.tsx,today.css,presets.ts,PresetSummary.tsx,PresetSummary.test.tsx}`, `features/today/Today.cadence.test.tsx` (new); `verification/layout/today.fits.spec.ts` (the new states) and `verification/layout/support/today.ts`; `packages/ui/src/components/ui/inline-notice.md` ("Today slots").
- Touches (append-only): `dev/layout/scenarios.ts`, `test/fixtures.ts`.
- Interfaces:
  - Consumes: E7's `TimerView` fields and four commands.
  - Produces: `statusLine(input: StatusInput): StatusLine | null` with `StatusLine { text, tone: "neutral" | "attention" | "warning" | "rest", actions: StatusAction[] }`; `requestIntentField(): void` and `onIntentFieldRequest(cb: () => void): () => void` in `intentEvents.ts` (E10's palette row calls `requestIntentField` after navigating to Today).
- Acceptance:
  - [ ] Every row of the spec's status-row table, in priority order, with its tone, text, actions and accessible names (two actions: the `InlineNotice` action plus a sibling `Button`); the stacked strip carries the `ModeChip` and drops the suggestion.
  - [ ] Controls in a break: "Pause break"/"Resume break" and "Skip break" (⌘. still works); focus stays on Pause when a break starts.
  - [ ] The summary in a break reads "Steady Focus · break · ends 14:30" ("long break").
  - [ ] Intent: Start sends none; the quiet button opens `IntentField` (`maxLength` 120); Return or blur saves, empty Return clears, Esc restores, focus returns to the button; never opens by itself; `task={view.intent}` reaches `TimerRing` and the wide `TimerStrip` only.
  - [ ] `today.fits` passes the spec's new states at C's size set in both themes; one primary each; the warning fade is instant under reduced motion.
  - [ ] The InlineNotice README lists E's rows (code-first, ADR-015).
- Tests first: `status_line_rank_for_every_row`, `status_row_two_actions_names`, `auto_step_warning_offers_take_break_not_extend`, `controls_in_break_skip_and_pause_break`, `summary_break_heading`, `intent_return_saves_blur_saves_escape_restores`, `intent_never_auto_opens`, `intent_request_event_opens_field`, `today_fits_<size>_<state>` (generated).
- Notes: sonnet. Lands before D8 starts (Shared with D). By eye (owner): each new Today state at 360×240, 900×600, 1440×900 in light and dark; the warning fade with and without reduce-motion.

### E9: Menu bar, notifications and the cadence settings rows
- Priority: 1
- Depends on: E7, E5, D5
- Owns: `tray/{render.rs,mod.rs}`, `tray/icons/{warning.png,break.png}` (new), `tray/menu/{entries.rs,commands.rs}`, `tray/tests/cadence_items.rs` (new); `packages/ui/src/components/ui/menu-bar-timer.md` (the two "(later)" marks); `crates/service/src/scheduler/{publish.rs,host.rs}`, `scheduler/tests/notify_cadence.rs` (new); `crates/platform-macos/src/app_active.rs` (new) and its `mod` line; `runtime/ticker.rs` (`AppHost::app_active`); `features/settings/sections/{CadenceRows.tsx,CadenceRows.test.tsx,Timer.tsx,Notifications.tsx}`, `features/settings/{settingsKeys.ts,Settings.tsx}`, `Settings.notifications.test.tsx`.
- Touches: `session/tests/support/fakes.rs` (the `Host` fake), `features/settings/notificationsToggle.ts` (reuse), `crates/core/src/platform.rs` (read).
- Interfaces:
  - Consumes: E7's view, milestones and `Effects`; E5's Timer section.
  - Produces: `Host::app_active(&self) -> bool`; `app_active::{is_active() -> bool, observe_activation()}` (main thread, cached).
- Acceptance:
  - [ ] Tray: the triangle and half-circle template glyphs (set with `set_icon_with_as_template`); items and headers per the spec's menu-bar table; "Add 10 minutes" and "Back to focus · 10 min" only while `canExtend`; accessibility label follows the mode word.
  - [ ] Notifications per the spec's table; one per `advance`; "Two minutes left." only with `notify.two_minutes` on, permission granted and Orasenda not active (`NSApplication.isActive`, cached from activation notifications, read on the main thread).
  - [ ] Settings › Timer: Extra 10 minutes radios, Deep-hours cap checkbox and hours (2–8), Keep going automatically and Longest focus (60–150) with the "already reaches this" helper, the suggestions `WellnessNote`; Notifications: "Two minutes before the end" (asks macOS while `notDetermined`, B's path). Save lines in B's family. Every file ≤ 500.
- Tests first: `tray_items_warning`, `tray_items_break_with_extend`, `tray_items_auto_step`, `tray_glyph_per_mode`, `notify_break_start_body_long`, `notify_two_minutes_gated_by_setting_status_and_active`, `one_notification_per_advance`, `extension_cap_radios_save`, `longest_focus_helper_when_preset_reaches_it`, `two_minutes_checkbox_asks_when_not_determined`.
- Notes: sonnet, opus review. If it passes four hours, the controller moves the Settings rows into their own PR with the same Owns subset. By eye (owner): both glyphs in light and dark menu bars; the Settings rows at the three sizes, light and dark.

### E10: Floater and full-screen states, "Set intent", close-out
- Priority: 2
- Depends on: E8, E9, E11, D6, D7, D8
- Owns: `features/focus/{FocusPage.tsx,FocusPage.test.tsx}`, `features/floater/{FloaterPage.tsx,FloaterPage.test.tsx}`; `verification/layout/{focusWindow,floaterWindow}.spec.ts` (break, warning and offer cases); `capabilities/{focus,floater}.json` and `lib_tests.rs` (their exact lists); `app/palette/{paletteCommands.ts,paletteCommands.test.ts}` ("Set intent"); close-out: `docs/specs/2026-11-12-session-cadence.md` (status implemented, Implementation status with each PR), `docs/ROADMAP.md` (row E done), `CONTEXT.md` (check E's terms).
- Touches: `features/today/intentEvents.ts` (consume), `features/timer/useSurfaceTimer.ts` (consume).
- Interfaces:
  - Consumes: E7's view and commands; E8's `requestIntentField`; E11's `secondaryActions`, `onSkipBreak`, `onKeepGoing`, `keepGoingName`; D's `useSurfaceTimer`, `paletteCommands`.
- Acceptance:
  - [ ] The Focus window and the floater pass `mode` and `task` from the view; break and warning show their shapes and words.
  - [ ] The Focus window passes E11's secondary actions per state: "+10 min" while `canExtend` in focus or warning, "Skip break" in a break, "Keep going" and "Stop here" with `offer`, "Take a break" in an auto step; End reads "End break" in a break. The floater passes `onSkipBreak` in a break and `onKeepGoing` with the offer. Each calls the same command as Today.
  - [ ] Grants are exactly what each window shows: `focus.json` gains `allow-timer-extend`, `allow-timer-take-break`, `allow-timer-dismiss-offer`; `floater.json` gains `allow-timer-stop` (Skip break only). The capability tests assert the exact lists.
  - [ ] The cases D left out (break, warning, the offer) pass in both specs, both themes.
  - [ ] The palette lists "Set intent" only while a focus runs or is paused; it navigates to Today and calls `requestIntentField`.
  - [ ] The spec reads implemented; ROADMAP row E reads done.
- Tests first: `focus_page_break_and_warning_modes`, `focus_page_secondary_action_per_state`, `floater_skip_break_and_keep_going`, `floater_break_and_warning_modes`, `focus_capability_exact_with_cadence`, `floater_capability_exact_with_cadence`, `palette_set_intent_only_in_focus`, `palette_set_intent_opens_field`.
- Notes: sonnet. By eye (owner): the Focus window and the floater in break, warning, auto step and the offer, light and dark, at D's sizes.

### E11: Break actions on FullScreenFocus and FloatingTimer (design system)
- Priority: 1
- Depends on: none (any early slot; the plan puts it in wave 3)
- Owns: `packages/ui/src/components/ui/full-screen-focus.{tsx,md,specimen.tsx,test.tsx}`, `packages/ui/src/components/ui/floating-timer.{tsx,md,specimen.tsx,test.tsx}`, `verification/layout/{fullScreenFocus,floatingTimer}.spec.ts`.
- Touches (append-only, only if needed): `packages/ui/src/index.ts`, `packages/ui/src/designSystem.test.ts`, `verification/contrast-pairs.json`.
- Interfaces (props inline in each `.tsx`, all optional, so D6 and D7 build unchanged):
  - Produces: `FullScreenFocus` `secondaryActions?: ReadonlyArray<{ id: string; label: string; name?: string; onSelect: () => void }>` (0–2; two only for the keep-going offer, the second ghost), and End labelled "End break" when `mode="break"`.
  - Produces: `FloatingTimer` `onSkipBreak?: () => void` (with `mode="break"`, Pause's slot becomes "Skip break") and `onKeepGoing?: () => void` with `keepGoingName?: string` (the Start pill's slot becomes "Keep going", named "Keep going with <name>").
- Acceptance:
  - [ ] FullScreenFocus: one quiet secondary slot in the controls row beside Pause/End; Pause/Resume stays the only round primary; "+10 min", "Skip break", "Keep going"/"Stop here" and "Take a break" render as the host passes them; the fixed control track does not grow; Tab order Leave → Pause/Resume → End → secondary actions (or as the README states).
  - [ ] FloatingTimer: "Skip break" and "Keep going" fit at 280×56; the README states their widths in the same form as the deep and ended widths now; targets ≥ 44×44.
  - [ ] Tokens only (closed Tailwind theme, no arbitrary values); new colour pairs, if any, in `contrast-pairs.json` at 4.5:1 text and 3:1 marks in both themes.
  - [ ] Both READMEs describe the props, states and accessible names; the components' existing harness cases still pass; new Playwright specimen cases for each action state at the README sizes, both themes, reduced motion.
  - [ ] First-consumer check (conventions): the review reads the spec's status-row names ("Add 10 minutes of focus", "Keep going with Steady Focus") and E10's acceptance.
- Tests first: `full_screen_focus_secondary_action_slot`, `full_screen_focus_two_actions_for_offer`, `full_screen_focus_end_break_label`, `floating_timer_skip_break_in_pause_slot`, `floating_timer_keep_going_in_start_slot`, `floating_timer_actions_fit_280x56`.
- Notes: sonnet, opus review (design-system change). After merge the controller republishes the design-system artifact from `main`. By eye (owner): both components in each new state at their README sizes, light and dark.

## Rulings (owner and controller, 2026-11-12)
1. **Owner:** the Focus window and floater get the break actions through a code-first component PR, E11; E10 depends on it and wires the props. Spec amended (Shared with D, last line).
2. `timer_take_break` is granted to `main` (E7) and to the Focus window (E10). Spec amended (Users & permissions).
3. `preset_remove`, `preset_undo_remove` and `presets_restore_defaults` return the live preset list (E5).
4. Converted "50/10" and "Custom" presets go after the three defaults (E4).
5. The controller updates D's plan (#331) and issues to match E4: `preset_select(presetId)`, `PresetEntry[]` in `presetChoices` and `paletteCommands`, D5 drops `preset_lengths()`, `allow-presets-list`, D4 and D6 depend on E4. The Shared with D rules above stand.
6. Each migration test builds the schema just before its own migration from the `MIGRATIONS` list (E1, D2). Spec amended (Testing strategy, Store).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: library, defaults, edits, 12, restore, `change_log`, migration from the previous schema | E1, E4, E5 |
| Goal 2: cadence, long break by round, chain resets | E6, E7 |
| Goal 3: one row per focus and per break, snapshot, one transaction | E1, E6, E7 |
| Goal 4: warning once, tray triangle, gated notification | E6, E7, E9 |
| Goal 5: +10 from the warning and the break, cap | E6, E7, E8, E9 |
| Goal 6: auto-continue | E6, E7, E8, E9 (Settings row) |
| Goal 7: keep-going offer | E6, E7, E8 |
| Goal 8: deep-hours cap | E6, E7, E8, E9 (Settings row) |
| Goal 9: intent | E6, E7, E8, E10 (palette) |
| Goal 10: suggestions with labels, verified | E3, E7, E8 |
| Goal 11: UI rules, harness, ≤ 500 lines | E2, E4, E5, E8, E9, E10 |
| Today status-row table, controls, summary | E8 |
| Settings › Timer and Notifications | E4, E5, E9 |
| Menu bar glyphs and items | E4 (Preset submenu), E9 |
| Notifications table, frontmost | E9 |
| READMEs: InlineNotice, MenuBarTimer | E8, E9 |
| Floater and full screen, their break actions | E11, E10 |
| Amendments to A, B, C, Components; CONTEXT terms | done in the spec PR (#330); E10 checks |
| Failure mode: a seed retried after a failed launch read | E4: `seed_retry_emits_presets_and_settings_changed` |
| Failure mode: `timer.preset` names a removed preset | E4: `unknown_preset_id_presents_first_live` |
| Failure mode: the two-row write fails at a break's end | E7: `two_row_end_write_fails_keeps_both_unsaved_once` |
| Failure mode: a relaunch inside the last two minutes | E7: `relaunch_in_warning_does_not_warn_again` |
| Failure mode: the clock set back before the last break | E6: `next_round_clock_set_back_no_panic` |
