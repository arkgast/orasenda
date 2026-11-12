# Hotkeys and capture (P1 sub-project F) — Implementation Plan

- Spec: [docs/specs/2026-11-12-hotkeys-and-capture.md](../specs/2026-11-12-hotkeys-and-capture.md)
- Date: 2026-11-12
- Status: in backlog (#386–#395)

## Overview
F is cut into ten tasks and built in the order components, store, services, adapter, then screens.
- **F1** builds the two new design-system components. It runs first and in parallel with F2 and F4.
- **F2** (store) and **F4** (keyboard service and IPC) are the foundations.
- **F3** (Inbox service) builds on F2, and **F5** (the plugin adapter and the menu bar) builds on F4.
- Then the screens, each functional and visual together:
  - **F6** the capture panel;
  - **F7** Settings › Keyboard;
  - **F8** single keys;
  - **F9** Board's Inbox;
  - **F10** welcome and tips.

Every UI task gets the opus code review and then the opus design review (layout boxes and gaps against the spec, no screenshots). Every file stays at 500 lines or fewer. Planned splits are named in each task's Notes.

Each task that changes IPC regenerates `bindings.ts` and updates the TS fixtures. Shared registration files are append-only. On a conflict the controller keeps both sides (`union.py`), then runs `cargo fmt` and `just bindings`, and fixes the exact capability lists. These files are:
- `commands.list.rs`, `commands/mod.rs`, `lib.rs`;
- the capability files and `lib_tests.rs`;
- `ipc.rs`, `test/fixtures.ts` and `dev/layout/scenarios.ts`.

## Contract
- **F4 owns the keyboard contract:**
  - `Settings { +startPauseKeys, +captureKeys, +singleKey }`;
  - `ShortcutId`, `ShortcutView`, `KeyboardView` and `KeyboardError`;
  - `keyboard_state`, `keyboard_set_shortcut` and `keyboard_restore_default`, and the event `keyboard-changed`;
  - the trait `ShortcutRegistrar`.
- **F3 owns the Inbox contract:** `NoteKind`, `NoteView`, `CaptureError` and `InboxError`; `capture_note`, `inbox_list`, `inbox_remove` and `inbox_restore`; the event `inbox-changed`.
- **F6 owns** `capture_open` and `capture_close`.
- **F10 owns** `TimerView { +tip, +welcome }`, `TipId` and `tip_seen`.
- The screen tasks consume these contracts and never change them.

## Impact
- **Schema:** migration `0005_inbox_note.sql` (F2), so `SCHEMA_VERSION` becomes 5 and the fresh-schema table count increases by one. It is forward-only (ADR-012). If another migration lands in parallel, the second to land renames itself (orasenda-status rule).
- **Settings:** three new keys and `Settings` fields (F4). `settingsQueue.ts`'s compile-time key list, every TS fixture that builds `Settings`, and `layoutMain.tsx` must follow. ADR-014's diff-then-write chain is unchanged; shortcut keys bypass it through `keyboard_set_shortcut`, which registers before writing.
- **Capabilities:** `main` gains the keyboard, inbox, `capture_open` and `tip_seen` commands. There is a new `capture.json`. `focus` and `floater` gain `capture_open`. The exact lists in `lib_tests.rs` follow each.
- **Public window model:** ADR-016 gains the `capture` line (F6), and ADR-017 moves to accepted (F5).
- **Dependency:** `tauri-plugin-global-shortcut` 2.4.1 (F5, through baton:deps), desktop only, so `just mobile` still builds.
- **Downstream checks that must stay green:**
  - the tray tests (`tray/tests.rs`), `window_min_tests.rs` and the floater and focus layout specs;
  - `today.*` specs (F8 and F10 touch Today) and `settings*.spec.ts` (F7).
- **Rollout and rollback:** squash PRs. Reverting F2 after notes exist leaves a table the older binary refuses ("newer data"), the existing store rule. That is acceptable before release.

## Dependency graph
```
F1 ─────────────┬──> F7 (also F4)
                └──> F9 (also F3)
F2 ──> F3 ──────┬──> F6 (also F5)
                └──> F9
F4 ──> F5 ──────> F6
F4 ──> F7
F4 ──> F8 ──> F10
```
Can start immediately in parallel: **F1, F2, F4**. Then F3 (after F2), F5 and F8 (after F4). Then F6, F7, F9 and F10. At most three run at a time.

## Tasks

### F1: ShortcutList and InboxRow components  (#386)
- Priority: 1
- Depends on: none
- Owns: `packages/ui/src/components/ui/shortcut-list.{tsx,md,test.tsx,specimen.tsx}`, `inbox-row.{tsx,md,test.tsx,specimen.tsx}`; `verification/layout/shortcutList.spec.ts` and `inboxRow.spec.ts`.
- Touches (append-only): `packages/ui/src/index.ts` (exports), the specimen registry (wherever the specimens are listed).
- Interfaces:
  - Produces: `ShortcutList({ items: { action: string; keys: string; spokenKeys: string; off?: boolean }[] })`; `InboxRow({ text: string; kind: "internal" | "external"; time: string; timeLabel: string; onRemove(): void; removeName: string })`.
- Acceptance:
  - [ ] ShortcutList is a semantic table (action and keys columns), `Kbd` per key with an sr-only spoken name (e-onboarding-3), "Off" as a word when `off`, capped at `panel-width`.
  - [ ] InboxRow: text wraps and is never truncated, then "Internal" or "External" · time as words, and a 44px `IconButton` Remove named by `removeName`. Its focus ring is visible, and it uses tokens only.
  - [ ] Layout: both components at 360 and 900 wide, with a 1000-character note, show no overflow and 44px targets, in both themes (contrast through `just contrast`).
  - [ ] Each README states the contract and what the host provides.
- Tests first: `shortcut_list_spoken_names`, `shortcut_list_off_word`, `inbox_row_kind_is_a_word`, `inbox_row_remove_named`, `inbox_row_long_text_wraps` (layout), `shortcut_list_fits_panel_width` (layout).
- Notes: sonnet. After merge, the controller republishes the design-system artifact.

### F2: Inbox store: migration 0005 and repository  (#387)
- Priority: 0
- Depends on: none
- Owns: `crates/store/migrations/0005_inbox_note.sql`, `crates/store/src/repo/inbox_notes.rs` (+ `repo/inbox_notes/tests.rs` if past 300 lines).
- Touches: `crates/store/src/lib.rs` (`SCHEMA_VERSION = 5`), `migrate.rs` (the MIGRATIONS entry), `repo/mod.rs`, and the fresh-schema test's table count.
- Interfaces:
  - Produces: `inbox_notes::insert(txn, &NewNote { id, text, kind, created_at }) -> Result<(), StoreError>`, `list_live(txn) -> Result<Vec<NoteRow>, StoreError>` (newest first), `remove(txn, id, at) -> Result<bool, StoreError>`, `restore(txn, id) -> Result<bool, StoreError>`; `NoteKind { Internal, External }`; `NoteRow { id, text, kind, created_at, deleted_at }`.
- Acceptance:
  - [ ] The table, CHECKs and index are as the spec says. A 1001-character insert and a bad kind are refused by the CHECK.
  - [ ] Every write logs change_log (entity `inbox_note`) in the same transaction, following `repo/presets.rs`.
  - [ ] `remove` and `restore` are idempotent and return whether a row changed. `list_live` skips tombstones.
  - [ ] An upgrade from schema 4 with data keeps every row. A store at schema 6 opens as "newer".
- Tests first: `inbox_insert_logs_change_log`, `inbox_list_live_newest_first_skips_removed`, `inbox_remove_restore_idempotent`, `inbox_text_check_rejects_1001`, `migrate_4_to_5_keeps_rows`.
- Notes: sonnet, rust.

### F3: Inbox service and IPC  (#389)
- Priority: 0
- Depends on: F2
- Owns: `crates/service/src/inbox/{mod.rs,service.rs,view.rs,tests.rs}` (new), `crates/service/src/api/inbox.rs` (new), `apps/orasenda/src-tauri/src/commands/inbox.rs` (new).
- Touches (append-only): `crates/service/src/lib.rs`, `api/mod.rs`, `api/events.rs` (`inbox-changed`), `commands/mod.rs`, `commands.list.rs`, `lib.rs`, `capabilities/main.json`, `lib_tests.rs`, `ipc/bindings.ts` (regenerated), `test/fixtures.ts`.
- Interfaces:
  - Consumes: `inbox_notes::*` from F2 (#387).
  - Produces:
    - `capture_note(note: NewCapture { text: String, kind: NoteKind }) -> Result<NoteView, CaptureError>`;
    - `inbox_list() -> Vec<NoteView>`;
    - `inbox_remove(id: String) -> Result<(), InboxError>` and `inbox_restore(id: String) -> Result<(), InboxError>`;
    - event `inbox-changed: Vec<NoteView>`;
    - `NoteView { id, text, kind, createdAt: String, createdAtLabel: String }`;
    - `CaptureError { Empty, TooLong, Store }`, `InboxError { NotFound, Store }`.
- Acceptance:
  - [ ] `capture_note` trims (inner newlines kept), refuses whitespace (`Empty`) and over 1000 characters (`TooLong`), writes a UUIDv7 id, and emits `inbox-changed`.
  - [ ] Time labels: "14:32" today, "Yesterday 14:32", "12 Nov 14:32", in local time, with a spoken label, through the existing clock formatting (`platform-macos/local_time.rs` through the service's clock seam).
  - [ ] Remove and restore emit `inbox-changed`; an unknown id gives `NotFound`; a store failure gives `Store` and is never silent.
  - [ ] `main` is granted `inbox_list`, `inbox_remove` and `inbox_restore`. `capture_note` is listed but granted to `capture` in F6 (F3 grants it to `main` only for its tests; F6 moves it).
- Tests first: `capture_note_trims_and_rejects_empty`, `capture_note_too_long`, `capture_note_emits_inbox_changed`, `inbox_time_labels_today_yesterday_date`, `inbox_remove_unknown_not_found`, `inbox_store_failure_is_error`.
- Notes: sonnet, rust.

### F4: Keyboard service and IPC  (#388)
- Priority: 0
- Depends on: none
- Owns: `crates/service/src/keyboard/{mod.rs,accelerator.rs,registrar.rs,service.rs,tests.rs}` (new), `crates/service/src/api/keyboard.rs` (new), `apps/orasenda/src-tauri/src/commands/keyboard.rs` (new).
- Touches:
  - service: `session/settings.rs` (three keys and defaults; at 330 lines, put the key list in `session/settings/keys.rs` if it would pass 400), `api/settings.rs` (fields), `session/service.rs` (the ⌃⌥F entry `start_pause_toggle(now)`), `session/hint.rs` (the `meta` helper reused for `used.global_shortcut`);
  - append-only: `api/events.rs` (`keyboard-changed`), `commands/mod.rs`, `commands.list.rs`, `lib.rs`, `capabilities/main.json`, `lib_tests.rs`;
  - TS: `ipc/bindings.ts`, `ipc/settingsQueue.ts` (the key list), `test/fixtures.ts`, `dev/layout/layoutMain.tsx`.
- Interfaces:
  - Produces:
    - `trait ShortcutRegistrar { fn register(&self, id: ShortcutId, acc: &Accelerator) -> Result<(), RegisterError>; fn unregister(&self, id: ShortcutId); }`;
    - `Accelerator::parse(&str) -> Result<Accelerator, ParseError>` and `Accelerator::describe(&self) -> String` ("⌃⌥F"), plus `spoken()` ("Control-Option-F");
    - `ShortcutId { StartPause, Capture }`;
    - `ShortcutView { keys: Option<String>, display: Option<String>, spoken: Option<String>, status: ShortcutStatus }`, `ShortcutStatus { Registered, Off, Failed }`;
    - `KeyboardView { startPause, capture, singleKey: bool, voiceOver: bool }`, `KeyboardError { Invalid, InUseByOrasenda, Unavailable, Store }`;
    - commands `keyboard_state() -> KeyboardView`, `keyboard_set_shortcut(id, keys: Option<String>) -> Result<KeyboardView, KeyboardError>`, `keyboard_restore_default(id) -> Result<KeyboardView, KeyboardError>`;
    - event `keyboard-changed: KeyboardView`;
    - `KeyboardService::on_pressed(id, now)`, which dispatches ⌃⌥F to `start_pause_toggle` and ⌃⌥N to a `CaptureOpener` callback (set by F6; a no-op until then);
    - `KeyboardService::set_voice_over(bool)` (fed by F5).
- Acceptance:
  - [ ] Register before saving: on `Unavailable` nothing is written and the old shortcut stays registered. On success the setting is written, then the old one is unregistered, then `keyboard-changed` is emitted.
  - [ ] `InUseByOrasenda` for the other global's keys and for ⌘K, ⇧⌘F, ⇧⌘T, ⌘,, ⌘↩, ⇧⌘↩ and ⌘..
  - [ ] Launch: `register_saved()` gives `Registered`, `Off` or `Failed` with no store write.
  - [ ] `start_pause_toggle`: idle or ended → start the selected preset; running focus or break → pause; paused → resume. It goes through the same lock and newest-wins as the commands. It sets `used.global_shortcut` once.
  - [ ] `singleKey` saves through the existing settings chain (ADR-014).
  - [ ] Keys, defaults and the canonical form are as the spec says; parse/describe round-trip for every key code the recorder emits.
- Tests first: `accelerator_round_trip`, `set_shortcut_registers_before_save`, `set_shortcut_unavailable_saves_nothing_keeps_old`, `set_shortcut_in_use_by_orasenda`, `restore_default_same_path`, `register_saved_failed_status`, `start_pause_toggle_each_state`, `start_pause_sets_used_flag_once`, `settings_single_key_default_true`.
- Notes: sonnet, rust and TS fixtures. A `FakeRegistrar` that can fail lives in `keyboard/tests.rs` (behind `test-support`). No plugin here: that is F5.

### F5: Global-shortcut adapter, VoiceOver and menu bar  (#390)
- Priority: 0
- Depends on: F4
- Owns:
  - `apps/orasenda/src-tauri/src/shortcuts/{mod.rs,plugin.rs,tests.rs}` (new: the plugin-backed `ShortcutRegistrar`, the press handler, `#[cfg(desktop)]`);
  - `crates/platform-macos/src/voice_over.rs` (new: `is_voice_over_enabled()` and an observer on `NSWorkspace` accessibility display options).
- Touches:
  - `apps/orasenda/src-tauri/Cargo.toml` and `Cargo.lock` (the plugin, through baton:deps);
  - `lib.rs` (plugin init and `register_saved` at startup), `tray/menu/entries.rs` and `tray/render.rs` (inert text on the start item; no live accelerator);
  - `crates/platform-macos/src/lib.rs`, `docs/DECISIONS.md` (ADR-017 → accepted);
  - `tray/tests.rs`: at 320 lines, add new tray tests in `tray/tests/shortcut_text.rs`.
- Interfaces:
  - Consumes: `ShortcutRegistrar`, `KeyboardService::on_pressed` and `set_voice_over` from F4 (#388).
  - Produces: `PluginRegistrar`; the tray start-item title "Start focus · 25 min  ⌃⌥F" when `Registered`, with no shortcut text when `Off` or `Failed`.
- Acceptance:
  - [ ] baton:deps report for `tauri-plugin-global-shortcut` 2.4.1 is in the PR body, and the audit is clean.
  - [ ] Only key-down presses dispatch, never key-up. A press while Orasenda is frontmost dispatches once.
  - [ ] Tray: the start item carries no accelerator. The inert text follows status and the user's keys, and updates on `keyboard-changed`.
  - [ ] VoiceOver state reaches `KeyboardView.voiceOver` at launch and on change.
  - [ ] `just mobile` builds (the plugin and adapter are desktop-only).
  - [ ] ADR-017 status is accepted, linking this PR.
- Tests first: `tray_start_item_inert_text_registered`, `tray_start_item_no_text_when_off_or_failed`, `tray_start_item_has_no_accelerator`, `press_dispatches_on_key_down_only`, `plugin_error_maps_to_unavailable`.
- Notes: sonnet, rust. The owner checks hands-on: ⌃⌥F from another app, with Orasenda frontmost, and with another app holding it.

### F6: Capture panel window  (#392)
- Priority: 1
- Depends on: F3, F5
- Owns:
  - `crates/platform-macos/src/windows/capture.rs` (new: the panel spec, reusing `overlay::swap_to_panel_class`, the levels and collection behaviour from the spec, placement on the display under the pointer, and `announce(text)`);
  - `apps/orasenda/src-tauri/src/windows/capture.rs` (new), `commands/capture.rs` (new);
  - `apps/orasenda/capture.html`, `apps/orasenda/src/features/capture/{main.tsx,CapturePage.tsx,CapturePage.test.tsx,capture.css}` (new);
  - `apps/orasenda/src-tauri/capabilities/capture.json` (new);
  - `verification/layout/captureWindow.spec.ts` (new).
- Touches:
  - append-only: `windows/mod.rs`, `commands/mod.rs`, `commands.list.rs`, `lib.rs`, `lib_tests.rs`, `capabilities/{main,focus,floater}.json` (`capture_open`);
  - `tray/menu/entries.rs` ("Capture a thought…" with inert ⌃⌥N);
  - `app/palette/paletteCommands.ts` ("Capture a thought");
  - Vite config (the entry), `layout.html` surfaces (`?surface=capture`);
  - `docs/DECISIONS.md` (the ADR-016 `capture` line).
- Interfaces:
  - Consumes: `capture_note` from F3 (#389); the `CaptureOpener` hook from F4 (#388), wired to `capture_open`; the inert-text helper from F5 (#390).
  - Produces: `capture_open() -> Result<(), WindowError>` and `capture_close()`.
- Acceptance:
  - [ ] **Step 0, a stop gate:** a test page in the real panel proves typing, IME composition (Japanese input) and focus in the text area while another app stays active. If it fails, stop and report; don't build around it.
  - [ ] ⌃⌥N, the tray item and ⌘K open the panel on the display under the pointer, upper third, at `panel-width`. A second open focuses its text area.
  - [ ] It appears over a full-screen app on its Space, takes keys, and doesn't activate Orasenda.
  - [ ] Save → `capture_note` → announce "Saved to Inbox." → close. A failure rejects, so the pad keeps the text and shows its line. Esc on an empty pad → close. The kind starts at Internal.
  - [ ] `capture.json` grants exactly `capture_note`, `capture_close`, `settings_get` and the core event permissions it listens to. The exact-list test passes.
  - [ ] Layout: every pad state fits, with 44px targets, in both themes.
- Tests first: `capture_window_spec_levels_and_behaviour` (Rust), `capture_capability_exact`, `capture_open_twice_focuses`, `capture_page_save_announces_then_closes`, `capture_page_failure_keeps_text`, `capture_page_empty_esc_closes`, `palette_has_capture_command`, `tray_capture_item_inert_text`.
- Notes: sonnet, mixed. The owner checks hands-on: over full-screen Keynote, on another Space, on a second display, with VoiceOver on (deferred).

### F7: Settings › Keyboard  (#393)
- Priority: 1
- Depends on: F1, F4
- Owns: `apps/orasenda/src/features/settings/sections/Keyboard.tsx` (new), `sections/KeyboardRows.tsx` (new, if Keyboard.tsx passes 250 lines), `features/settings/useKeyboard.ts` (new), `Settings.keyboard.test.tsx` (new), `verification/layout/settings.keyboard.spec.ts` (new).
- Touches: `Settings.tsx` (at 381: add only the section mount, and move the section list to `settingsSections.ts` if it would pass 400), `SettingsHeader.tsx` (`SectionId` + `"keyboard"`), `settingsTarget.ts` (`keyboard`), `ipc.rs` (`SettingsTarget::Keyboard`).
- Interfaces:
  - Consumes: `keyboard_state`, `keyboard_set_shortcut`, `keyboard_restore_default` and `keyboard-changed` from F4 (#388); `ShortcutList` from F1 (#386); `ShortcutRecorder`, `SettingsRow`, `Choice`.
  - Produces: none beyond the section.
- Acceptance:
  - [ ] The rows, order and copy are exactly as the spec says, including the three error lines. The VoiceOver line shows only while `voiceOver` is on and the keys use ⌃⌥.
  - [ ] Record → set → the save line "Start or pause focus: ⌃⌥G."; Delete → off → "Start or pause focus: off."; Restore default; `Unavailable` keeps the old keys shown with the conflict line. Newest wins on overlapping changes.
  - [ ] The *Single-key shortcuts* checkbox saves through the settings chain. The All shortcuts list marks the single keys "Off" when it is off.
  - [ ] The section is in the Settings index between Notifications and Apps and sites; `SettingsTarget "keyboard"` scrolls to it.
  - [ ] Layout at the Settings size set: no overflow, 44px targets, the recorder ≥ `field-width`, both themes.
- Tests first: `keyboard_rows_order_and_copy`, `keyboard_record_saves_with_line`, `keyboard_unavailable_keeps_old_and_shows_conflict`, `keyboard_in_use_by_orasenda_line`, `keyboard_voice_over_line_only_when_on`, `keyboard_single_key_toggle_saves`, `keyboard_list_marks_single_keys_off`.
- Notes: sonnet, ui.

### F8: Single-key shortcuts on Today and in the Focus window  (#391)
- Priority: 1
- Depends on: F4
- Owns: `apps/orasenda/src/app/useSingleKeys.ts` (new, shared: a key that is not in a field, control or open popover, honouring `singleKey`), `useSingleKeys.test.ts`, `features/today/Today.keys.test.tsx`, `features/focus/FocusPage.keys.test.tsx` (new).
- Touches: `features/today/Today.tsx` (at 352: only the hook call and props; put the key map in `features/today/todayKeys.ts`), `Controls.tsx` (`singleKeys` from the setting), `PresetSummary.tsx` (the tooltip "Change preset · P"), the Focus view button (tooltip "Focus view · F"), `features/focus/FocusPage.tsx` (Space; `singleKeys` prop from the setting).
- Interfaces:
  - Consumes: `Settings.singleKey` from F4 (#388).
  - Produces: `useSingleKeys(map: Record<string, () => void>, enabled: boolean): void`.
- Acceptance:
  - [ ] Today: Space starts, pauses or resumes; F opens the Focus view menu; P opens the preset popover. Only while focus is on the body or heading, never in a field, a control or an open menu, and never with a modifier.
  - [ ] Focus window: Space starts, pauses or resumes, with the same rule.
  - [ ] With `singleKey` off, none fires, and captions, tooltips and `aria-keyshortcuts` drop the single key (StartButton and FullScreenFocus `singleKeys`).
  - [ ] The floater is unchanged.
  - [ ] The existing `today.focus` and `focusWindow` specs stay green.
- Tests first: `space_toggles_on_body`, `space_ignored_in_field_and_on_button`, `f_opens_focus_view_menu`, `p_opens_preset_popover`, `keys_off_do_nothing`, `captions_drop_single_keys_when_off`, `focus_page_space_toggles`.
- Notes: sonnet, ui.

### F9: Board's Inbox list  (#394)
- Priority: 1
- Depends on: F1, F3
- Owns: `apps/orasenda/src/features/board/{BoardPage.tsx,useInbox.ts,BoardPage.test.tsx,board.css}` (new), `verification/layout/board.spec.ts` (new), `dev/layout` scenarios for Board (append).
- Touches: `app/App.tsx` (route `board` to BoardPage instead of Placeholder).
- Interfaces:
  - Consumes: `inbox_list`, `inbox_remove`, `inbox_restore` and `inbox-changed` from F3 (#389); `InboxRow` from F1 (#386); `PageFrame`, `ScrollRegion`, `EmptyState`, `InlineNotice`; `KeyboardView.capture` from F4 (#388) for the empty-state copy.
- Acceptance:
  - [ ] Heading "Inbox" and live notes newest first. The list updates on `inbox-changed` with no reload.
  - [ ] Remove hides the note at once and shows "Note removed." with Undo, until the next removal or 10 s. Undo restores it in place. Remove and restore failures show a plain line and are never silent.
  - [ ] Empty states: "Nothing in your Inbox." plus "⌃⌥N captures a thought from anywhere." (the user's keys) or "Capture a thought from the menu bar." when that shortcut is off or failed.
  - [ ] After Remove, focus moves to the next row's Remove, or the previous one, or the heading.
  - [ ] Layout with 0, 1 and 50 notes at Today's size set: it scrolls inside `ScrollRegion`, 44px targets, both themes.
- Tests first: `board_lists_newest_first`, `board_updates_on_inbox_changed`, `board_remove_then_undo`, `board_remove_failure_line`, `board_empty_copy_follows_shortcut_status`, `board_focus_after_remove`.
- Notes: sonnet, ui.

### F10: Welcome line and tips  (#395)
- Priority: 2
- Depends on: F4, F8
- Owns: `crates/service/src/session/tips.rs` (new: derivation, `meta` flags and `tip_seen`), `session/tests/tips.rs` (new), `crates/service/src/api/tips.rs` (new), `apps/orasenda/src-tauri/src/commands/tips.rs` (new), `apps/orasenda/src/features/today/useTips.ts` (new), `Today.tips.test.tsx` (new).
- Touches:
  - service: `session/view.rs` (`tip`, `welcome`), the end-milestone path (session-end count), and the Focus view and floater open paths (`used.focus_view`, through the service);
  - TS: `features/today/statusLine.ts` (tip and welcome rows per the InlineNotice ranking; at 232 lines), `Today.tsx` (only the hook call);
  - append-only: `commands.list.rs`, `lib.rs`, `capabilities/main.json`, `lib_tests.rs`, `bindings.ts`, `test/fixtures.ts`, `dev/layout/scenarios.ts`, `verification/layout/support/today.ts` `STATES` (`welcome`, `tipShortcut`, `tipFocusView`).
- Interfaces:
  - Consumes: `KeyboardView` (status, voiceOver), the `used.global_shortcut` flag from F4 (#388); `Settings.singleKey` (F8's wiring).
  - Produces: `TimerView { tip: Option<TipId>, welcome: bool }`, `TipId { GlobalShortcut, GlobalShortcutMenu, FocusView, FocusViewKeys }`, `tip_seen(tip: TipId, how: TipSeen) -> Result<TimerView, TimerCommandError>`, `TipSeen { GotIt, Shown }`.
- Acceptance:
  - [ ] The welcome line shows only when `onboard.welcome_done` is absent and there are no `focus_session` rows; first Start sets the flag.
  - [ ] Tip 1 after the 1st session end, tip 2 after the 2nd. The variant follows shortcut status, VoiceOver and `singleKey`.
  - [ ] Seen on Got it, on use (`used.*`), or on the 2nd showing; never on Start; none while the store can't write.
  - [ ] Copy is exactly as in the spec table, ≤ 65 characters, and the spoken form uses the spoken keys.
  - [ ] Got it removes only the tip; "Session ended." stays.
  - [ ] Layout: the longest tip joined to "Session ended." at 360×240 keeps the 44px row, and `expectTodayGaps` passes for the new states.
- Tests first: `welcome_only_true_first_run`, `tip1_after_first_end_variants`, `tip2_after_second_end_variants`, `tip_seen_on_got_it_use_or_second_showing`, `no_tip_while_store_unavailable`, `got_it_keeps_session_ended`, `today_tip_fits_360x240` (layout).
- Notes: sonnet, mixed.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: ⌃⌥F in each state, once, no window | F4 (`start_pause_toggle_each_state`), F5 (`press_dispatches_on_key_down_only`) |
| Goal 2: ⌃⌥N panel placement, full screen, focus | F6 |
| Goal 3: registration failure behaviour | F4, F5, F7 |
| Goal 4: record, change, off, restore; register before save | F4, F7 |
| Goal 5: single keys off | F7, F8 |
| Goal 6: capture save transaction and failure | F2, F3, F6 |
| Goal 7: Board list, Remove and Undo, live update | F3, F9 |
| Goal 8: welcome and tips | F10 |
| ADR-016 line, ADR-017 accepted | F6, F5 |
| Failure mode: the panel can't take typing (non-activating) | F6: step 0 stop gate |
| Failure mode: ⌃⌥F and a Start in flight at the same moment | F4: `start_pause_toggle_each_state` (racing start) |
| Failure mode: the synced shortcut fails on this device | F4: `register_saved_failed_status` |
| Failure mode: a 1000-character note at 360 wide | F1: `inbox_row_long_text_wraps` |
| Failure mode: the store is unavailable during capture | F3: `inbox_store_failure_is_error`, F6: `capture_page_failure_keeps_text` |
