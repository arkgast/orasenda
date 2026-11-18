# Board polish (P2) — Implementation Plan

- Spec: [docs/specs/2026-11-15-board-polish.md](../specs/2026-11-15-board-polish.md)
- Date: 2026-11-15
- Status: done (2026-11-16)

## Overview
Four tasks, one per existing issue. Each has its tests written first, keeps every file at 500 lines or fewer, passes `./scripts/ci.sh`, and gets an opus review plus one fix round. The UI tasks also get the opus design review (no screenshots: the owner reviews visuals). The spec status and ROADMAP close-out are folded into the P2 close-out at the end of the task-import plan.

| Task | Issue | What | Depends on | Wave |
|---|---|---|---|---|
| **P2** | #574 | `useSingleKeySetting` in `@domain/keyboard` | none | 1 |
| **P3** | #575 | TaskCard title clamp | none | 1 |
| **P5** | #581 | Palette: *Choose a task…* and *Clear task* | none | 1 |
| **P6** | #580 | Rows as one tab stop; ⇧F10 and ContextMenu; PopoverMenu `returnFocus` | P2, P3 | 2 |

P2–P5 own disjoint files. No task adds a dependency. After P3 and after P6 merge, the controller republishes the design system from main.

## Contract
- P2 owns `useSingleKeySetting(): { on: boolean; failed: boolean }` in `apps/orasenda/src/domain/keyboard/useSingleKeySetting.ts`.
- P6 owns:
  - `menuTabIndex?: 0 | -1` on `InboxRow` and `TaskCard`;
  - `returnFocus?: RefObject<HTMLElement | null>` on `PopoverMenu`;
  - F10 in `describeShortcut`.
- P5 owns:
  - the App palette mode `"tasks"`;
  - `PaletteInput.tasksOnly` and `PaletteInput.tasks`;
  - `Palette`'s props `onMode` and `tasksOnly?: boolean` (mirrors `displaysOnly`, `Palette.tsx:16`).

## Impact
- **P6 changes PopoverMenu**, a component every menu uses. The new prop is optional and the default is unchanged, so the existing PopoverMenu tests and every page menu test act as regression checks.

## Tasks

### P2: `useSingleKeySetting` in `@domain/keyboard`  (#574)
- Priority: 2
- Kind: web (mechanical move)
- Depends on: none
- Owns:
  - new `apps/orasenda/src/domain/keyboard/useSingleKeySetting.ts` and `.test.ts`;
  - deleting `features/board/useSingleKeyOn.ts` and `features/inbox/useSingleKeyOn.ts`.
- Touches: the import lines in `features/board/BoardPage.tsx`, `features/inbox/InboxPage.tsx` and `features/routines/RunView.tsx`; `features/routines/useRunKeys.ts` (remove the hook and its now-unused imports only).
- Acceptance:
  - [ ] `grep -r useSingleKeyOn apps/` finds nothing.
  - [ ] Board and Inbox read `.on`; RunView reads `{ on, failed }`.
  - [ ] The one console message is `"settings_get failed: single keys stay off"`.
  - [ ] The existing Board, Inbox and RunView tests pass unchanged.
- Tests first (`useSingleKeySetting.test.ts`): `off_until_settings_read`, `event_beats_late_get`, `failed_on_rejected_get`, `next_event_clears_failed`, `logs_once_on_rejected_get`.

### P3: TaskCard title clamp  (#575)
- Priority: 2
- Kind: ui
- Depends on: none
- Owns:
  - `packages/ui/src/components/ui/task-card.tsx`, `task-card.md`, `task-card.test.tsx` and `task-card.specimen.tsx`.
- Touches: none.
- Acceptance:
  - [ ] In `density="card"` the title span has `line-clamp-3`.
  - [ ] The button form's `aria-label` and the read-only form's `sr-only` text hold the full title, and the visible span is `aria-hidden` in the read-only form.
  - [ ] `task-card.md` and the specimen show a long-title card.
  - [ ] `density="row"` is unchanged.
- Tests first: `long_title_keeps_full_accessible_name` (button form and read-only form).

### P5: Palette: choose or clear the session's task  (#581)
- Priority: 2
- Kind: web
- Depends on: none
- Owns:
  - `apps/orasenda/src/app/palette/Palette.tsx`, `paletteCommands.ts` and their tests (a new `paletteTasks.ts` and test if `paletteCommands.ts` would pass 500 lines);
  - the palette-state lines in `apps/orasenda/src/app/App.tsx` (`:122-131,231-237`);
  - the palette section of `apps/orasenda/src/app/App.test.tsx`, or a new `App.palette.test.tsx` if that file would pass 500 lines.
- Touches:
  - `shared/test/fixtures` (a task options builder, append);
  - `domain/board/useTaskOptions.ts`, read only. The sort lives in `paletteCommands.ts` or `paletteTasks.ts`.
- Notes:
  - `PaletteInput.tasks` is required, so every existing `paletteCommands(...)` call in `paletteCommands.test.ts` gains `tasks: []`.
  - The default `mockBackend` answers `board_get` with tasks that aren't Done (`shared/test/fixtures/index.ts:87`). So *Choose a task…* now shows in the existing `Palette.test.tsx` and `App*.test.tsx` lists; update the expected lists.
- Acceptance:
  - [ ] *Choose a task…* comes right after the session commands, and only when some task isn't Done. Selecting it remounts the palette in task mode with an empty query.
  - [ ] Task mode lists the tasks that aren't Done, Doing then Today then Backlog in board order. The label is the title; the hint is the column in words, plus " · Frog".
  - [ ] Enter calls `timerSetTask(id)`. Esc closes the palette, and focus returns to the original opener.
  - [ ] *Clear task* is listed only when `view.task` is set, directly after *Choose a task…*, and calls `timerSetTask(null)`.
  - [ ] In task mode the dialog title and list label stay "Commands".
  - [ ] Failures show `report("choose that task")` or `report("clear the task")`.
  - [ ] Nothing is pre-selected or promoted.
- Tests first:
  - `choose_task_hidden_without_open_tasks`;
  - `choose_task_remounts_with_empty_query`;
  - `task_mode_orders_doing_today_backlog_with_hints`;
  - `enter_sets_task`;
  - `clear_task_only_when_linked`;
  - `set_task_failure_shows_line`;
  - `esc_in_task_mode_closes`;
  - `esc_in_task_mode_returns_focus_to_first_opener` (an App test).

### P6: Rows as one tab stop with a menu key  (#580)
- Priority: 3
- Kind: ui
- Depends on: P2, P3
- Owns:
  - `packages/ui/src/components/ui/inbox-row.{tsx,md,test.tsx,specimen.tsx}`;
  - `task-card.{tsx,md,test.tsx,specimen.tsx}`;
  - `popover-menu.{tsx,md}` and a new `popover-menu.return-focus.test.tsx` (`popover-menu.test.tsx` is 453 lines and doesn't grow);
  - `icon-button.{tsx,md}`;
  - `kbd.md` (its key table, `:31`);
  - `packages/ui/src/lib/shortcuts.ts` (and its doc comment at `:45`) and its test.
- Touches:
  - `apps/orasenda/src/features/inbox/InboxPage.tsx` (`InboxRow` is rendered at `:86-98`) and `features/inbox/useRovingRows.ts` (read only);
  - `features/board/BoardCard.tsx` and `features/board/BoardPage.keys.test.tsx`;
  - `features/board/useBoardKeys.ts`, only if the unshifted ContextMenu key needs to pass through its capture handler (`:96-138`);
  - `features/inbox/InboxPage.move.test.tsx` (the fake-timer fix and the ⇧F10 test).
- Acceptance:
  - [ ] Rows that rove pass `menuTabIndex={-1}`, so Tab from a row leaves the list.
  - [ ] ⇧F10 and ContextMenu on the focused row open its menu with focus on the first item. The native `contextmenu` that follows is prevented.
  - [ ] Esc and choose return focus to the row for a key-opened menu, and to the More button for a click-opened one.
  - [ ] The More button shows ⇧F10 in its tooltip and `aria-keyshortcuts`.
  - [ ] With single keys off, ⇧F10 → *Move to Board* works on the Inbox.
  - [ ] Disabled cards and cards with no menu ignore the key.
  - [ ] The five READMEs (`inbox-row`, `task-card`, `icon-button`, `popover-menu`, `kbd`) and the `describeShortcut` doc comment are updated.
  - [ ] No new dependency.
  - [ ] `the_move_failed_line_does_not_expire` turns fake timers on before pressing B.
- Tests first:
  - `describe_shortcut_f10` comes first: `packages/ui/test-setup.ts:5` makes `describeShortcut` throw on unknown glyphs, so every row test fails until F10 is known;
  - `roving_row_more_button_is_not_a_tab_stop` (`tabIndex` is -1 with `menuTabIndex={-1}`, and 0 without it);
  - `shift_f10_opens_row_menu`;
  - `context_menu_key_opens_row_menu`;
  - `esc_returns_focus_to_row_after_key_open`;
  - `click_open_returns_focus_to_more_button`;
  - `move_to_board_by_menu_key_with_single_keys_off`;
  - `return_focus_prop_overrides_anchor` (PopoverMenu, plus Esc and choose variants);
  - `native_contextmenu_prevented_after_key_open`;
  - `more_button_names_shift_f10` (the tooltip Kbd, and `aria-keyshortcuts="Shift+F10"`);
  - `disabled_or_menuless_card_ignores_menu_key`;
  - `menu_key_while_open_does_nothing`;
  - `shift_f10_opens_card_menu_on_board` and `context_menu_key_reaches_card_through_board_capture` (`BoardPage.keys.test.tsx`).

## Coverage
| Input or failure | Covered by |
|---|---|
| `settings_get` rejects | P2 `failed_on_rejected_get` |
| `timer_set_task` rejects | P5 `set_task_failure_shows_line` |
| A key-opened menu on a disabled card | P6 acceptance (ignored) |
