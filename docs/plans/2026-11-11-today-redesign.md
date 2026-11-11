# Today redesign (P1 sub-project C) — Implementation Plan

- Spec: [docs/specs/2026-11-11-today-redesign.md](../specs/2026-11-11-today-redesign.md)
- Date: 2026-11-11
- Status: in backlog (#296–#304; owner approved 2026-11-11: "go autonomous")

## Overview
The plan has nine tasks, one PR each.
- **First:** the foundations: the WebKit harness (C1) and the IPC contract (C2).
- **Next:** the shell, with its window minimum, compact rule, Pages button, glyphs and ⌘1–6 (C3).
- **Then Today, in two slices:**
  - C4: the grid, time view, controls, status row and the shortcuts ⌘↩, ⌘⇧↩ and ⌘.;
  - C5: the preset summary and popover.

  Each slice ships behaviour and UI together. Today stays usable after C4 because Settings still chooses the preset.
- **Separately:**
  - the menu bar (C7) and the DevPanel window (C8);
  - Settings in compact windows (C6);
  - the InlineNotice README (C9).

Every source file stays at or under 500 lines. `features/settings/Settings.tsx` is at 494, so C6 splits it.

## Contract
C2 owns every IPC change:
- `TimerView.plannedMin`;
- `presets_get`;
- `native_menu_popup`;
- the corrected `ClockTick.idleFinish` doc.

C2 also regenerates `apps/orasenda/src/ipc/bindings.ts` and adds `plannedMin` to the TypeScript fixtures in `apps/orasenda/src/test/fixtures.ts`. C3, C4, C5 and C6 build against those bindings.

## Impact
- **Affected call paths and consumers:**
  - `TimerView` gains a field. Every TypeScript fixture and every Rust test that builds a view must set it (C2).
  - The tray's render input gains the next-session data (C7).
  - The main window's capability loses the spike commands and the `dev` window gets them (C8). The main window's capability also gains `native_menu_popup` and `presets_get` (C2).
  - The window minimum changes from 900×600 to 360×240 (C3). Settings must then work compact (C6); until C6 merges it gets the rail-less shell at small sizes, without Jump to section.
- **Data and migrations:** none.
- **Tests that must stay green:**
  - `cargo test` for `orasenda-service` and the app crate;
  - Vitest for App, Today, Settings, DevPanel and `settingsQueue`;
  - `just layout`, which keeps the existing component specs;
  - the bindings check;
  - `just file-size`.
- **Rollout and rollback:** each task is one squash-merged PR. A revert brings back the previous page. C3's smaller minimum is rolled back by reverting `tauri.conf.json` alone.

## Dependency graph
```
C1 ─┬─> C3 ─┬─> C4 ──> C5
C2 ─┘       └─> C6
C2 ──┐
C7 ──┴─> C8
C9 (independent)
```
Can start immediately in parallel: C1, C2, C7, C9.

## Tasks

### C1: App layout harness and #119's failing case (#296)
- Priority: 1
- Depends on: none
- Owns:
  - `apps/orasenda/layout.html`
  - `apps/orasenda/src/dev/layout/{layoutMain.tsx,scenarios.ts,scenarios.test.ts}`
  - `verification/layout/playwright.config.ts`
  - `verification/layout/support/app.ts` (new: `openApp(page, scenario, size)`)
  - `verification/layout/today.fits.spec.ts`
  - `verification/layout/settings.spec.ts`
- Touches (read-only or additive): `apps/orasenda/src/test/fixtures.ts` (read), `verification/layout/support/*` (reuse `fits`, `hitTargets`, `focusRing`, `motion`), `verification/layout/tsconfig.json` (include the new support file if needed).
- Interfaces:
  - Produces:
    - `layout.html?scenario=<name>`, which renders `App` with `mockIPC`. The scenario names are `idle`, `ended`, `recovered`, `running`, `paused`, `storeEnded`, `startError`, `timerUnavailable`, `starting`, `settingsUnavailable` and `customChecked`. The query `&popover=1` opens the preset popover once it exists, and `&page=settings` opens Settings.
    - A second Playwright `webServer` on port 4180 (`pnpm --filter orasenda exec vite --port 4180 --strictPort`).
    - `openApp(page: Page, scenario: string, size: {width:number,height:number}, opts?: {page?: string}): Promise<void>` in `support/app.ts`.
- Acceptance:
  - [ ] `just layout` runs `today.fits.spec.ts`. At 900×600 the cases `idle`, `ended` and `customChecked` assert that the document does not scroll and that Start's `bottom <= innerHeight`. `ended` and `customChecked` are marked `test.fail()` with a comment naming #119. All of this passes in CI as expected-fail.
  - [ ] `settings.spec.ts` checks Settings at 900×600 and 1440×900 with the longest save line ("Focus and break minutes weren't saved. Still using 45 and 10." beside *Show*) and the denied-on notification line: no document scroll, a 44px status row, and every control ≥ 44×44.
  - [ ] `layout.html` is not a build input: `vite.config.ts`'s `rollupOptions.input` is unchanged, and `tauri build` bundles no `layout` chunk.
  - [ ] `scenarios.test.ts` checks that every scenario answers `timer_state`, `settings_get` and `app_info`.
- Tests first: `today_start_visible_900x600_after_end` (expected fail), `today_start_visible_900x600_custom_checked` (expected fail), `settings_fits_900x600_longest_save_line`, `scenarios_answer_core_commands`.
- Notes:
  - #119's issue body has the measurement harness to adapt.
  - The app dev server must not need Tauri: everything goes through `mockIPC`.
  - Playwright is already a dependency, so no `baton:deps` step is needed.

### C2: IPC: `plannedMin`, `presets_get`, `native_menu_popup` (#297)
- Priority: 1
- Depends on: none
- Owns:
  - `crates/service/src/api/timer.rs`
  - `crates/service/src/session/view.rs` (and its tests under `crates/service/src/session/tests/`, new file `view_planned.rs` if a file would pass 500)
  - `crates/service/src/api/settings.rs` (`PresetLength`)
  - `apps/orasenda/src-tauri/src/commands/{mod.rs,menu_popup.rs,presets.rs}`
  - `apps/orasenda/src-tauri/build.rs`
  - `apps/orasenda/src-tauri/capabilities/main.json` (adds `allow-presets-get` and `allow-native-menu-popup`)
  - `apps/orasenda/src/ipc/bindings.ts` (regenerated)
  - `apps/orasenda/src/test/fixtures.ts`
- Touches: `crates/core/src/timer/mod.rs` (read: the preset table), `apps/orasenda/src-tauri/src/lib.rs` (registration line only if the command list lives there), the Rust tests that build a `TimerView` (add `planned_min`).
- Interfaces:
  - Produces:
    - `TimerView.planned_min: Option<u32>` → TS `plannedMin: number | null`.
    - `presets_get() -> Vec<PresetLength>` with `PresetLength { preset: Preset, focus_min: u32, break_min: u32 }` → TS `commands.presetsGet(): Promise<PresetLength[]>`.
    - `native_menu_popup(request: NativeMenuRequest) -> Option<String>`, with `NativeMenuRequest { items: Vec<NativeMenuItem>, x: f64, y: f64 }` and `NativeMenuItem { id: String, label: String, accelerator: Option<String>, checked: Option<bool> }`. In TS that is `commands.nativeMenuPopup(request): Promise<string | null>`.
- Acceptance:
  - [ ] `plannedMin` is `null` when idle, 25 for a running Classic session, kept while paused, 2 for quick, and the Custom value at start even after Custom changes in Settings.
  - [ ] `presets_get` returns exactly classic 25/5, fifty_ten 50/10 and deep_block 90/15, in that order, read from core's table.
  - [ ] `native_menu_popup` builds one item per entry with its accelerator and checked mark, and answers the chosen id. A dismissed menu answers `null`, and so does a call while another popup is open. The popup runs on the main thread, and no lock is held across the AppKit call.
  - [ ] `ClockTick.idle_finish`'s doc says it is set only while idle.
  - [ ] The bindings are regenerated and committed. `pnpm --filter orasenda typecheck` and `test` pass with the fixtures updated.
- Tests first: `view_planned_min_idle_none`, `view_planned_min_running_classic`, `view_planned_min_paused_kept`, `view_planned_min_quick`, `view_planned_min_custom_ignores_later_settings`, `presets_get_lists_three_fixed_presets`, `menu_popup_items_carry_accelerator_and_check`, `menu_popup_second_call_while_open_is_none`.
- Notes:
  - On macOS, `Window::popup_menu_at` blocks until the menu closes. Record the chosen id through the menu-event handler into a one-shot slot keyed by a popup id, then answer it.
  - The "already open" guard is a small mutex flag.

### C3: Shell: 360×240 minimum, compact rule, Pages button, glyphs, ⌘1–6 (#300)
- Priority: 1
- Depends on: C1, C2
- Owns:
  - `apps/orasenda/src-tauri/tauri.conf.json` (`minWidth` 360, `minHeight` 240)
  - `apps/orasenda/src-tauri/src/window_min_tests.rs` (new) and its `mod` line in `lib.rs`
  - `apps/orasenda/src/app/{App.tsx,App.test.tsx,Placeholder.tsx,useWindowLayout.ts,useWindowLayout.test.ts,PagesButton.tsx,PagesButton.test.tsx,useShortcuts.ts,useShortcuts.test.ts,glyphs.tsx}`
  - `apps/orasenda/src/app/Placeholder.test.tsx` (new)
  - `apps/orasenda/src/styles/app.css` (shell rules only: `.app`, `.app-column`, the header removed, `.app-bound`; it leaves the `.today*` rules for C4)
  - `verification/layout/appShell.spec.ts`
- Touches: `apps/orasenda/src-tauri/src/lib.rs` (one `mod` line), `packages/tokens/tokens.json` (read).
- Interfaces:
  - Consumes: `commands.nativeMenuPopup(request): Promise<string | null>` (C2).
  - Produces:
    - `useWindowLayout(): { compact: boolean; timer: "ring" | "strip" | "stackedStrip"; width: number; height: number }`;
    - `PagesButton(props: { current: NavPage; onNavigate(page: NavPage): void }): ReactElement`;
    - `useShortcuts(bindings: ReadonlyArray<{ key: string; meta: true; shift?: boolean; when(): boolean; run(): void }>): void`;
    - `glyphs.tsx` exports `PauseGlyph`, `PlayGlyph`, `EndGlyph`, `PagesGlyph`, `ChevronGlyph` and `JumpGlyph`. Each is an `aria-hidden` SVG on a 20-unit grid with a 1.5 stroke and round caps and joins, drawn from Lucide's geometry (ISC). The file header says T7 replaces it.
- Acceptance:
  - [ ] `window_minimum_equals_tokens` passes.
  - [ ] The brand and version header is gone from every page.
  - [ ] When `compact`, `NavRail` is not rendered. Each placeholder page shows a `hit-min` top row with the Pages button above its `EmptyState`.
  - [ ] The compact thresholds come from `--layout-compact-width` and `--layout-compact-height`, read from the computed style, with no hard-coded number.
  - [ ] Pages sends six items (Today through Settings) with accelerators "Cmd+1" through "Cmd+6", the current page checked, and the button's bottom-left as the point. A chosen id navigates and focuses the page's `h1`. `null` does nothing.
  - [ ] ⌘1 through ⌘6 navigate from any page. They are ignored when the target is editable or while composing, and not prevented when no binding matches.
  - [ ] `appShell.spec.ts`: at 360×240, 480×320, 640×480 and 900×600, on Today and on Board, the document does not scroll. The rail shows only at 640×480 and up, and the Pages button only below that. Targets are ≥ 44×44.
  - [ ] Existing Today tests still pass. Today's markup is unchanged in this task.
- Tests first: `window_minimum_equals_tokens`, `compact_below_640_wide`, `compact_below_480_high`, `pages_button_sends_six_items_current_checked`, `pages_choice_navigates_and_focuses_h1`, `pages_dismiss_does_nothing`, `cmd_digit_navigates`, `cmd_digit_ignored_in_input`, `placeholder_compact_shows_pages`, `shell_has_no_brand_header`.
- Notes:
  - Removing the header changes `App.test.tsx`'s `infoLine` assertions. Settings › About still shows the version.
  - A refactor PR moves code or changes it, never both; this task changes code only.

### C4: Today: grid, time, controls, status row, ⌘↩ ⌘⇧↩ ⌘. (#301)
- Priority: 1
- Depends on: C3
- Owns:
  - `apps/orasenda/src/features/today/{Today.tsx,today.css,statusLine.ts,statusLine.test.ts,Controls.tsx,TimeView.tsx}`
  - `apps/orasenda/src/features/today/{Today.start.test.tsx,Today.controls.test.tsx,Today.notices.test.tsx,Today.support.tsx}`
  - deletes `Today.presets.test.tsx`, `Today.ranges.test.tsx` and `Today.saves.test.tsx`, after moving any still-valid save-chain cases to C5
  - `apps/orasenda/src/styles/app.css` (only to delete the `.today*` rules)
  - `verification/layout/today.fits.spec.ts` (removes the `test.fail()` marks and extends to the spec's size set × states)
  - `verification/layout/today.{focus,motion}.spec.ts`
  - `apps/orasenda/src/dev/layout/scenarios.ts` (additive: `pauseError`)
- Touches: `apps/orasenda/src/app/{useWindowLayout.ts,useShortcuts.ts,glyphs.tsx}` (consume), `apps/orasenda/src/features/settings/customRange.ts` (no longer imported by Today), `apps/orasenda/src/dev/DevPanel.tsx` (no longer imported by Today).
- Interfaces:
  - Consumes: `useWindowLayout`, `useShortcuts` and the glyphs (C3); `TimerView.plannedMin` (C2).
  - Produces:
    - `statusLine(input: { startError: boolean; controlError: boolean; timerUnavailable: boolean; notice: string | null; store: StoreStatus }): { text: string; tone: "neutral" | "attention"; action?: "tryAgain" } | null`;
    - the top row's centre cell, `<div data-slot="today-summary">`, which C5 fills (an empty `hit-min` cell until then);
    - `Today`'s grid areas `top`, `status`, `time` and `controls`.
- Acceptance:
  - [ ] Today renders the grid from the spec's table for ring, strip and stackedStrip, with every length a token. The strip's 180px column uses a token, or the task records a ruling on its issue. No arbitrary Tailwind value is used.
  - [ ] The time view is `TimerRing size="fluid"` with `clock`, or `TimerStrip` (`stacked` in stackedStrip, `idleLength` from the next session's minutes while idle).
  - [ ] Idle shows `StartButton` with `compactLabel="Start"`, `singleKeys={false}`, `loading` and `unavailable`, and no `finishTime`. Running and paused show the round Pause or Resume session button (one element) and End session with `shortcut="⌘."`, `space-6` apart.
  - [ ] Every start sends `custom: null`. Today has no `Choice`, `Input` or range helper, and does not render `DevPanel`.
  - [ ] The status row shows the spec's rows in priority order. It joins a rank-2 line with the store line only up to 65 characters, logs the races and shows no line for them. Try again repeats the last start request.
  - [ ] ⌘↩ and ⌘⇧↩ start only while idle and not starting. ⌘. ends only while running or paused.
  - [ ] Focus: Start → Pause session. End → Start focus, after the line mounts. Pause ↔ Resume keeps focus. Nothing moves on a tick or on a transition from another surface.
  - [ ] `today.fits` passes for every size × state in light and dark, and the #119 cases pass without `test.fail()`. `today.focus` shows the focus ring at every Tab stop, in the spec's order, at 360×240, 900×600 and 1440×900. `today.motion` finds no running animation under reduced motion.
  - [ ] The ring is between 160 and 560px, and exactly 560 at 1280×800 and 1440×900.
  - [ ] PR body: closes #119 and #120. "Not yet verified" lists the owner's visual check.
- Tests first: `status_line_priority_start_error_over_milestone`, `status_line_joins_store_within_65`, `status_line_store_alone_when_joined_too_long`, `status_line_races_show_nothing`, `start_sends_custom_null`, `cmd_enter_starts_only_idle`, `cmd_shift_enter_quick`, `cmd_period_ends_running_and_paused`, `pause_resume_keeps_focus`, `end_moves_focus_to_start_after_line`, `try_again_repeats_start`, `today_fits_<size>_<state>` (generated), `today_focus_ring_each_stop`, `today_no_motion_reduced`.
- Notes:
  - Keep `Today.tsx` under 300 lines by putting the controls in `Controls.tsx` and the ring or strip choice in `TimeView.tsx`.
  - The `h1` stays: visually hidden, `tabIndex={-1}`.
  - In the stacked strip, the status row carries the `ModeChip`.

### C5: Today: preset summary and popover (#302)
- Priority: 1
- Depends on: C4
- Owns:
  - `apps/orasenda/src/features/today/{PresetSummary.tsx,PresetSummary.test.tsx,presets.ts,presets.test.ts}`
  - `apps/orasenda/src/features/today/Today.tsx` (mounts the summary in `today-summary`)
  - `apps/orasenda/src/features/today/Today.saves.test.tsx` (recreated if save-chain cases remain)
  - `verification/layout/today.popover.spec.ts`
- Touches: `apps/orasenda/src/ipc/settingsQueue.ts` (consume), `apps/orasenda/src/app/glyphs.tsx` (`ChevronGlyph`), `apps/orasenda/src/dev/layout/scenarios.ts` (additive: `popover=1`).
- Interfaces:
  - Consumes: `commands.presetsGet()` and `TimerView.plannedMin` (C2); the `today-summary` slot (C4).
  - Produces: `presetName(preset: Preset): string` and `summaryText(input): { visible: string; short: string; name: string; tooltip: string }` in `presets.ts`.
- Acceptance:
  - [ ] Each row of the spec's summary table (idle, idle strip, running, paused, settings unavailable) renders its visible text, short form, accessible name and tooltip.
  - [ ] The short form switches by a container query on `--container-start-compact`.
  - [ ] Idle popover: the heading, the line, four radios with metas from `presets_get` and the saved Custom, and the "Edit times in Settings" link with "⌘,". Choosing a radio saves through `settingsQueue` and closes.
  - [ ] The link opens Settings › Timer through the `SettingsTarget` path.
  - [ ] Running or paused: `readOnly`, heading "<name> · <plannedMin> min", the line "Presets can change between sessions.", and the link still live. A quick session has heading "Just 2 minutes" and no checked radio.
  - [ ] Settings not loaded: "Presets unavailable", `aria-disabled`, and no popover.
  - [ ] `today.popover.spec.ts`: with the popover open at 360×240, 900×600 and 1440×900, the panel stays inside the viewport and the document does not scroll.
- Tests first: `summary_idle_text_name_tooltip`, `summary_running_ends_from_view_finish`, `summary_paused_uses_planned_min`, `summary_short_form_under_400`, `popover_idle_four_radios_metas`, `popover_choose_saves_and_closes`, `popover_running_read_only_heading`, `popover_quick_no_checked_radio`, `popover_settings_link_opens_timer`, `summary_settings_unavailable_disabled`.

### C6: Settings in compact windows (#303)
- Priority: 2
- Depends on: C3
- Owns:
  - `apps/orasenda/src/features/settings/Settings.tsx` (split: the header and compact picker move to the new `SettingsHeader.tsx` so `Settings.tsx` stays under 500 lines)
  - `apps/orasenda/src/features/settings/{SettingsHeader.tsx,SettingsHeader.test.tsx,settings.css}`
  - `apps/orasenda/src/features/settings/Settings.navigation.test.tsx`
  - `verification/layout/settings.spec.ts` (adds the compact sizes)
- Touches: `apps/orasenda/src/app/{PagesButton.tsx,useWindowLayout.ts,glyphs.tsx}` (consume), `apps/orasenda/src/dev/layout/scenarios.ts` (additive).
- Interfaces:
  - Consumes: `PagesButton`, `useWindowLayout`, `JumpGlyph` (C3); `commands.nativeMenuPopup` (C2).
  - Produces: none.
- Acceptance:
  - [ ] When compact, `PageFrame`'s `compactPicker` holds the Pages button and then a "Jump to section" `IconButton` (`aria-haspopup="menu"`). That button opens a native menu of the sections with the current one checked. Choosing one jumps to it and focuses its heading, as the SettingsIndex does.
  - [ ] When compact, the `SettingsIndex` is not rendered, and the `h1` is visually hidden but still takes focus on arrival.
  - [ ] `settings.spec.ts` at 360×240 and 480×320: no document scroll, a 44px status row, a scroll region at least 96px tall, every control reachable by Tab inside the region, and targets ≥ 44×44.
  - [ ] Every file stays at or under 500 lines (`just file-size`).
- Tests first: `compact_settings_shows_pages_and_jump`, `jump_menu_lists_sections_current_checked`, `jump_choice_focuses_section_heading`, `settings_fits_360x240`.
- Notes: the split moves code and changes it in the same task. Here that is allowed, because the split exists to make room for the change (conventions, "Plans split before they grow"). The PR names which lines moved unchanged.

### C7: Menu bar: Start, Just 2 minutes, Preset, status header (#298)
- Priority: 1
- Depends on: none
- Owns:
  - `apps/orasenda/src-tauri/src/tray/{menu.rs,mod.rs,render.rs,state.rs,tests.rs}`
  - `apps/orasenda/src-tauri/src/tray/tests/{menu_items.rs,header.rs}` (new splits)
  - `apps/orasenda/src-tauri/src/runtime/{session.rs,events.rs}` (publish settings changes to the tray)
- Touches: `crates/service/src/session/{settings.rs,service.rs}` (consume: the saved settings and `Action::Start`), `apps/orasenda/src-tauri/src/lifecycle.rs` (consume `show_settings` with a Timer target, via the existing navigate path), `apps/orasenda/src-tauri/src/commands/settings.rs` (read: the `settings_set` chain the Preset submenu reuses).
- Interfaces:
  - Produces:
    - `menu_items(view: &TimerView, next: &NextSession, spike: bool) -> Vec<MenuEntry>`;
    - `header_text(view: &TimerView) -> Option<String>`;
    - `NextSession { preset: Preset, focus_min: u32 }`.
  - Consumes: `Action::Start(StartRequest)` from `crates/service/src/session/service.rs`.
- Acceptance:
  - [ ] Idle items: "Start focus · 25 min" (the next session's minutes), "Just 2 minutes", and "Preset" with four check items (the saved one checked, labels "Classic 25 / 5", "50/10 50 / 10", "Deep Block 90 / 15" and "Custom 45 / 10"), a separator and "Edit times in Settings…". Then Show Orasenda, "Settings…" with ⌘,, and "Quit Orasenda" with ⌘Q.
  - [ ] Running: the disabled header "Focus · 18 minutes left · ends 15:20", "Pause session" and "End session". Paused: "Paused · 18 minutes left", "Resume session" and "End session". The minutes round up, and one minute reads "1 minute left".
  - [ ] Start runs `Action::Start` with the saved preset and `custom: None`, and Just 2 minutes runs it with `quick`. Choosing a preset saves through the service's settings chain and emits `settings-changed`.
  - [ ] The header's text changes with `set_text` at most once a minute. The menu is rebuilt only when the item list changes.
  - [ ] A settings change re-renders the idle menu: the Start minutes and the checked preset follow it.
  - [ ] The threading contract is unchanged: no lock is held across an AppKit call (`tray/mod.rs` doc).
  - [ ] `spike: bool` is in the signature, but C7 always passes `false`. C8 adds the item.
- Tests first: `menu_items_idle`, `menu_items_running`, `menu_items_paused`, `header_minutes_ceil_and_singular`, `preset_submenu_checks_saved`, `start_item_uses_saved_preset_and_no_custom`, `settings_change_rerenders_menu`, `header_set_text_once_a_minute`.

### C8: DevPanel in its own window (#304)
- Priority: 2
- Depends on: C2, C7
- Owns:
  - `apps/orasenda/src-tauri/src/spike/window.rs` (new) and its `mod` line in `spike/mod.rs`
  - `apps/orasenda/src-tauri/capabilities/{dev.json,main.json}` (the spike permissions move to `dev`)
  - `apps/orasenda/dev.html`
  - `apps/orasenda/src/dev/{devMain.tsx,devMain.test.tsx}`
  - `apps/orasenda/vite.config.ts` (adds the `dev` input)
  - `apps/orasenda/src-tauri/src/tray/menu.rs` (the "Developer panel" item when `spike::enabled()`)
- Touches: `apps/orasenda/src/dev/DevPanel.tsx` (unchanged inside), `apps/orasenda/src-tauri/tauri.conf.json` (only if the window must be declared there; prefer creating it at runtime), `apps/orasenda/src-tauri/src/tray/tests.rs` (additive).
- Interfaces:
  - Produces: `spike::window::open_dev_panel(app: &AppHandle) -> tauri::Result<()>`.
- Acceptance:
  - [ ] With `spike::enabled()`, the menu bar shows "Developer panel" in its own group above Quit. It opens the `dev` window (480×640, resizable, title "Developer panel"), or focuses it if already open.
  - [ ] Without `spike::enabled()`, neither the item nor the window exists (`dev_window_only_when_enabled`, `menu_items_spike`).
  - [ ] The `dev` window renders `DevPanel` and its spike commands work there. `capabilities/main.json` no longer lists the spike permissions.
  - [ ] Today no longer renders `DevPanel`. That removal is C4's; if C8 merges first, it leaves Today alone.
- Tests first: `dev_window_only_when_enabled`, `menu_items_spike`, `dev_entry_renders_panel`.

### C9: InlineNotice README, Today slots (#299)
- Priority: 2
- Depends on: none
- Owns: `packages/ui/src/components/ui/inline-notice.md`
- Touches: none
- Interfaces: none
- Acceptance:
  - [ ] The three refused-start rows are removed, with a sentence citing the ruling on #120.
  - [ ] "Any other start error, or the timer unavailable" is split into the start-error row (Try again) and "Timer unavailable. Restart Orasenda to try again." (no action, never clears this launch).
  - [ ] A row is added: "Pause, resume or end failed", attention, "Orasenda's timer isn't responding.", no action, cleared by the next successful command or view change.
  - [ ] The Ended row's action reads "none ('Got it' only when joined with a tip)".
  - [ ] The paragraph after the table no longer mentions "Open Settings" for a refused start.
  - [ ] After merge, the controller republishes the design-system artifact from `main` (memory note design-system-publish).
- Tests first: none (docs). `just design-system-check` still passes.
- Notes: haiku writes it, and opus reviews it against the spec's status-row table.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: no scroll, primary visible, 44px status row, targets, both themes | C1, C4, C3, C6 |
| Goal 2: `timerLayout`, ring 160–560 | C4 |
| Goal 3: focus ring and tab order, reduced motion | C4 |
| Goal 4: `custom: null`, no radios or fields | C4 |
| Goal 5: shortcuts and `aria-keyshortcuts` | C3 (⌘1–6), C4 (⌘↩ ⌘⇧↩ ⌘.) |
| Goal 6: menu-bar items | C7, C8 |
| Goal 7: 360×240 minimum = tokens; Settings and placeholders compact | C3, C6 |
| Goal 8: DevPanel window | C8 (C4 removes it from Today) |
| Goal 9: #119 first as expected-fail | C1 → C4 |
| Preset summary and popover | C5 |
| `plannedMin`, `presets_get`, `native_menu_popup` | C2 |
| Status-row table and README | C4, C9 |
| Spec A amendments | done in the spec PR (#294) |
| Failure mode: `native_menu_popup` called while a popup is open | C2: `menu_popup_second_call_while_open_is_none` |
| Failure mode: Custom minutes changed in Settings during a session | C2: `view_planned_min_custom_ignores_later_settings`; C5: `summary_paused_uses_planned_min` |
| Failure mode: `settings_get` fails at launch | C5: `summary_settings_unavailable_disabled` |
| Failure mode: ⌘ key while typing in a Settings field | C3: `cmd_digit_ignored_in_input` |
| Failure mode: a start answers `invalidSpec` (should be impossible) | C4: `status_line_invalid_spec_is_start_error` |
