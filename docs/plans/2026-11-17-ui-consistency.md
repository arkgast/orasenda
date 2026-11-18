# UI consistency — Implementation Plan

- Spec: [docs/specs/2026-11-17-ui-consistency.md](../specs/2026-11-17-ui-consistency.md)
- Date: 2026-11-17
- Status: draft

## Overview
Six tasks, each one PR. Tests are written first in every task. Every file stays at 500 lines or fewer, and every task passes `./scripts/ci.sh`. UI tasks get the opus design review; the owner reviews visuals, so there are no screenshots.

Design-system tasks (U2, U3) come before the screens (U4, U5). U6 changes `PageFrame` and adopts it on the pages in one PR, so the prop and its first consumers are reviewed together (conventions: "Design-system changes are checked against their first consumer").

`packages/ui/design-system/README.md` is edited by U2, U3 and U6. They run in that order, so no two parallel tasks touch it. U4 and U5 run in parallel and own disjoint files. U1 is docs only and runs any time.

| Task | What | Depends on | Wave |
|---|---|---|---|
| **U1** | "Reading context" rule; superseded note in the routines spec | none | 1 |
| **U2** | Shapes: `Button` radius, `inline` / `row`; `IconButton` `ring`; `DayPicker` radius | none | 1 |
| **U3** | Glyphs `more` and `plus`; read-only done steps; finished edge | U2 | 2 |
| **U4** | Routines: ⋯ menus, + Add, quiet Start, ticked steps | U3 | 3 |
| **U5** | Board: + Add task, header-gap check | U3 | 3 |
| **U6** | `PageFrame width="content"`; Routines, Inbox, Review centred; Settings centred | U4 | 4 |

**Controller steps** (not sonnet tasks):
- After U3 merges and after U6 merges, the controller (or an opus agent) runs `just design-system` from `main` and republishes the live artifact with `"editing": "code"`. Follow the memory note "Design system publish".
- After U6, the controller ticks the spec's Implementation status. The owner then runs the visual checklist in the spec's Testing strategy.

## Contract
- **U2** owns:
  - `ButtonProps.variant: "primary" | "break" | "quiet" | "ghost" | "critical" | "inline"`;
  - `ButtonProps.size: "md" | "lg" | "row"`;
  - `IconButtonProps.size: "md" | "ring"` (`"round"` removed).
- **U3** owns:
  - `IconName` gains `"more"` and `"plus"`;
  - `RoutineItem` `readOnly` honours `done` and `name`;
  - `RoutineCard` sets `border-s-break` when `today === "finished"`.
- **U4** owns the app `ActionMenu` props: `trigger: "more" | "add"` replaces `label: string`.
- **U6** owns `PageFrameProps.width?: "full" | "content"`.

## Impact
- **U2 changes `Button` and `IconButton`, which every screen uses.**
  - Removing `round` is a breaking type change. Its two callers (`features/today/Controls.tsx:62`, `full-screen-focus.tsx:264`) are updated in the same PR.
  - The existing `button`, `icon-button`, `start-button`, `floating-timer`, `full-screen-focus` and `timerRing` / `fullScreenFocus` layout tests are the regression net.
  - Rollback is a revert.
- **U6 changes `PageFrame`.** The new prop is optional and the default renders as today, so Board, Calendar and Settings are untouched unless they opt in.
- **No schema, IPC or permission change.**

## Dependency graph
```
U1 (independent)
U2 ──> U3 ──> U4 ──> U6
             └─> U5
```
Can start immediately in parallel: U1, U2.

## Tasks

### U1: Reading context and the superseded note
- Priority: 2
- Kind: docs
- Depends on: none
- Owns:
  - `docs/conventions.md` (a new section "Reading context");
  - `docs/specs/2026-11-14-routines-and-habits.md` (adds superseded notes only, and changes no other text).
- Touches: none.
- Interfaces: none.
- Acceptance:
  - [ ] `docs/conventions.md` gains "## Reading context" with three rules:
    - Current rules live in living docs: `packages/ui/design-system/README.md`, the component `.md` files, `docs/DECISIONS.md`, `CONTEXT.md` and this file.
    - Specs are history: grep them by topic, and never read them whole.
    - A reversed decision gets `> Superseded by <spec path> (Decision N)` directly under it in the source spec, in the PR that reverses it.

    The section links JCIOriente/baton#207 as upstream.
  - [ ] In the routines spec, `> Superseded by [2026-11-17-ui-consistency](2026-11-17-ui-consistency.md) (Decision 4)` sits under Decision 41, under the Overview bullet (the "one primary action is Start" sentence), and under the canvas table that follows the "Routines page" row.
  - [ ] Nothing else in the routines spec changes (`git diff` shows only added lines).
- Tests first: none (docs). `./scripts/ci.sh` passes.

### U2: Shapes: Button, IconButton `ring`, DayPicker, `inline` and `row`
- Priority: 1
- Kind: ui (design system)
- Depends on: none
- Owns:
  - `packages/ui/src/components/ui/button.{tsx,md,test.tsx,specimen.tsx}`;
  - `icon-button.{tsx,md,test.tsx,specimen.tsx}`;
  - `day-picker.{tsx,md,test.tsx}` (and its specimen if present);
  - `inline-notice.tsx` (the action button at `:73`) and `inline-notice.md` if it names the classes;
  - `start-button.md`;
  - `floating-timer.md` and the comment at `floating-timer.tsx:23`;
  - `packages/tokens/tokens.json` (the `radius-md` and `radius-pill` `usage` strings only), plus any generated file `just tokens` rewrites from it;
  - `packages/ui/design-system/README.md`:
    - the Layout radius line (`:50`);
    - the play-glyph line (`:138`, "floater's Start pill" becomes "floater's Start button");
    - the DayPicker row of the States table.
- Touches (one line each):
  - `full-screen-focus.tsx:264` (`size="ring"`);
  - `apps/orasenda/src/features/today/Controls.tsx:62` (`size="ring"`);
  - `apps/orasenda/src/features/today/StatusRow.tsx:46`;
  - `apps/orasenda/src/features/inbox/InboxStatus.tsx:55`;
  - the `"where"` text of the "IconButton round focus ring" pair in `verification/contrast-pairs.json`.
- Interfaces:
  - Produces: `ButtonProps.variant` with `"inline"`, `ButtonProps.size` with `"row"`, and `IconButtonProps.size: "md" | "ring"`.
- Acceptance:
  - [ ] No `rounded-pill` in `button.tsx`. Every variant renders `rounded-md`.
  - [ ] `variant="inline"`:
    - rest: clear border and ground, `text-focus`;
    - hover: `bg-surface-sunken`, `text-ink`;
    - pressed: `bg-selection`, `text-ink`;
    - disabled: the shared dashed look.
  - [ ] `size="row"` adds `flex-none px-3` and nothing else.
  - [ ] `InlineNotice`'s action, `InboxStatus`'s "Open Board" and `StatusRow`'s second action use the new variant and size. `grep -rn "flex-none px-3 text-focus" apps packages/ui/src` finds nothing.
  - [ ] `IconButton` `size="round"` no longer type-checks. `size="ring"` renders the old round look, and `icon-button.md` says it is only for Pause/Resume beside a `TimerRing` or in `FullScreenFocus`.
  - [ ] `DayPicker` toggles are `rounded-md`. `day-picker.md` and the README States row say "filled `focus` rounded rectangle" (on) and "`line-strong` outline" (off) in place of disc and ring.
  - [ ] The README Layout line reads: "`radius-sm` for fields and choices, `radius-md` for every button (primary included), icon button, toggle, card and block, `radius-lg` for dialogs and wells, `radius-pill` for information only: chips, tags, dots, tracks and the session-slot capsule. The one circular control is the `ring` Pause/Resume beside the timer ring."
  - [ ] The `tokens.json` usage strings say the same.
  - [ ] `button.md` drops "(pill, `focus` fill)" and documents `inline` and `row`.
  - [ ] `start-button.md` and `floating-timer.md` say "Start button" instead of "Start pill".
  - [ ] Every existing test passes, including the WebKit layout run, and the hit targets are unchanged.
- Tests first:
  - `every_variant_is_rounded_md` (button);
  - `inline_variant_has_focus_text_and_ghost_ground`;
  - `row_size_is_flex_none_px_3`;
  - `ring_size_is_round_control_lg` (icon-button, renamed from the round case);
  - `day_toggle_is_rounded_md` (day-picker).
- Notes:
  - Tokens only, no arbitrary values (`just tailwind-strict`).
  - The README and tokens text must not promise anything U3 or U6 adds.

### U3: Glyphs and done steps: `more`, `plus`, read-only done steps, finished edge
- Priority: 1
- Kind: ui (design system)
- Depends on: U2 (README)
- Owns:
  - `packages/ui/src/components/ui/icon.{tsx,md,test.tsx}` (and its specimen if present);
  - `inbox-row.tsx` (`:103` glyph only) and `inbox-row.md` if it names the glyph;
  - `task-card.tsx` (`:165` glyph only) and `task-card.md` if it names the glyph;
  - `icon-button.specimen.tsx` and `popover-menu.specimen.tsx` (`menu` becomes `more` where it stands for More actions);
  - `routine-item.{tsx,md,test.tsx}` (and its specimen if present);
  - `routine-card.{tsx,md,test.tsx,specimen.tsx}`;
  - `verification/contrast-pairs.json` (adds pairs; U2's single `where` edit has merged by then);
  - `packages/ui/design-system/README.md`:
    - the Icon set line, with the count and list, plus "`more` (⋯) is the overflow trigger; `plus` sits beside a create action's word";
    - the RoutineItem row of the States table (read-only done: filled `break` box and tick, no tab stop).
- Touches: none.
- Interfaces:
  - Produces: `IconName` includes `"more"` and `"plus"`;
  - Produces: `<RoutineItem readOnly done name />` renders a ticked, named, non-focusable row;
  - Produces: `RoutineCard` `today="finished"` gives a `border-s-break` edge.
- Acceptance:
  - [ ] `more` is three round-capped dots on the horizontal centre line of the 20-unit grid at a 1.5 stroke. `plus` is a 13-unit cross centred on the grid. Both are `aria-hidden` in `currentColor`, like the rest of the table.
  - [ ] `InboxRow` and `TaskCard` More buttons draw `more`. Their names, tooltips, `tabIndex` and ⇧F10 are unchanged.
  - [ ] Read-only `RoutineItem`:
    - with `done`: a `bg-break border-break` box holding the `on-break` tick, and an `ink-muted` label;
    - without `done`: the hollow box, as today;
    - in both cases: no tab stop, no `checkbox` role, and `data-done` set when done.
  - [ ] With `name`, the read-only row's accessible text is the name: an `sr-only` span holds it and the visible text is `aria-hidden`.
  - [ ] The read-only row has `max-w-full` instead of `max-w-panel-width`. The checkbox form keeps `max-w-panel-width`.
  - [ ] `RoutineCard` has `border-s-break` with `today="finished"` and `border-s-routine` otherwise.
  - [ ] `verification/contrast-pairs.json` gains `break` on `surface-raised` (`kind: "mark"`, "RoutineCard finished edge") and, if missing, `break` on `surface` as a mark. `just contrast` passes in light and dark, and the PR states both ratios.
  - [ ] The `routine-card` specimen shows notStarted, inProgress (partly ticked) and finished (all ticked) cards.
  - [ ] The READMEs are updated: `icon.md`, `routine-item.md` and `routine-card.md` ("the edge turns `break` when finished; the words stay").
- Tests first:
  - `more_and_plus_glyphs_exist` (icon; also update any glyph-count assertion);
  - `inbox_row_more_uses_more_glyph`;
  - `task_card_more_uses_more_glyph`;
  - `read_only_done_shows_tick_without_checkbox`;
  - `read_only_done_is_not_a_tab_stop`;
  - `read_only_name_is_spoken_text`;
  - `read_only_fills_width_checkbox_keeps_panel_width`;
  - `finished_card_has_break_edge`;
  - `in_progress_card_keeps_routine_edge`.
- Notes:
  - The tick reuses the checkbox form's SVG path. Draw it once and share it, so the two forms can't drift.
  - Forced colours: the done box keeps its border.

### U4: Routines: ⋯ menus, + Add, quiet Start, ticked steps
- Priority: 1
- Kind: ui (app)
- Depends on: U3
- Owns:
  - `apps/orasenda/src/features/routines/ActionMenu.tsx`;
  - `RoutineList.tsx`;
  - `HabitList.tsx`;
  - `RoutinesPage.tsx` (the header primary, removal of `primaryStart`);
  - `routines.css`, only if the step grid needs to change for the icon trigger;
  - the routines tests: `RoutinesPage.overview.test.tsx`, `RoutinesPage.writes.test.tsx`, `RoutinesPage.templates.test.tsx`, `useUndoRemove.test.tsx` (names change from "More for X" to "More actions for X"), and `RunView.test.tsx` (one new assertion).
- Touches: `verification/layout/routines*.spec.ts`, only where it queries the "More" or "Add" names.
- Interfaces:
  - Consumes: `Icon name="more" | "plus"` (U3), `RoutineItem readOnly done name` (U3).
  - Produces: `ActionMenu({ id?, trigger: "more" | "add", name?, heading, items, onSelect })`.
- Acceptance:
  - [ ] `trigger="more"` renders an `IconButton` with `Icon name="more"` and `label={name}`, plus `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`.
  - [ ] Routine cards, steps and habits pass `name="More actions for <name>"`. Focus returns to the trigger by `moreId` after a move or Undo, as today.
  - [ ] `trigger="add"` renders a primary `Button` with `<Icon name="plus" />` and the word "Add", and `aria-label="Add a routine or habit"`. The menu items are unchanged. The visible label starts the name (WCAG 2.5.3).
  - [ ] Routine-row Start is `variant="quiet"` on every row. `primaryStart` and its export are removed, and the overview has exactly one `[data-variant="primary"]`.
  - [ ] Read-only steps pass `done={habit.doneToday}`. When done, they pass `name={"Done today: " + habit.name}`.
  - [ ] Empty state unchanged: the header "Start from a template" and the empty state's "Make your own".
  - [ ] `RunView` is not edited. A test asserts one primary while running and one when ended.
  - [ ] No "More" text appears on any trigger: `getAllByText("More")` finds nothing.
- Tests first:
  - `overview_has_one_primary_add`;
  - `every_routine_start_is_quiet`;
  - `more_trigger_is_icon_named_for_item` (routine, step, habit);
  - `add_menu_opens_with_three_items`;
  - `done_steps_are_ticked_and_named` (a partly done routine: done steps ticked, the rest hollow);
  - `finished_routine_has_finished_card_with_all_done_steps_ticked`;
  - `run_view_has_one_primary_per_state`.
- Notes:
  - Fixtures already carry `doneToday` and `today`; use the builders in `shared/test/fixtures`.
  - Keep each test file under 500 lines. Split by behaviour if one would pass it.

### U5: Board: + Add task and the header gap
- Priority: 2
- Kind: ui (app)
- Depends on: U3
- Owns:
  - `apps/orasenda/src/features/board/BoardPage.tsx` (the header primary, `:235-240`);
  - `apps/orasenda/src/features/board/board.css`, only if extra spacing is found;
  - a new case in `verification/layout/board.spec.ts`.
- Touches: the Board tests that query the "Add task" button by role and name; the name is unchanged, so they should pass as is.
- Interfaces:
  - Consumes: `Icon name="plus"` (U3).
- Acceptance:
  - [ ] The header primary is `<Button variant="primary"><Icon name="plus" />Add task</Button>`, with the accessible name "Add task".
  - [ ] At 900 × 600 and 1440 × 900, the top of the first column minus the header's bottom is at most `space-2 + hit-min + space-2 + space-1` (64px), the `PageFrame` contract.
  - [ ] If the measured gap is larger, the extra spacing is removed with tokens only, and the PR names what it was. If it already holds, the PR says the gap is the reserved status row (spec Decision 6) and changes no CSS.
  - [ ] Columns keep their `column-width` / `column-wide-width` caps and stay left-aligned.
- Tests first:
  - `add_task_has_plus_glyph_and_name` (BoardPage);
  - `board_header_to_columns_gap_within_contract` (layout).

### U6: Content width: `PageFrame width="content"`; Settings centred
- Priority: 2
- Kind: ui (design system + app)
- Depends on: U4 (`RoutinesPage.tsx`, `routines.css`); U3 (README)
- Owns:
  - `packages/ui/src/components/ui/page-frame.{tsx,md,test.tsx,specimen.tsx}`;
  - the Layout `content-width` line of `packages/ui/design-system/README.md` (adds "Routines, Inbox and Review use `PageFrame width="content"`: header, status row and region share one centred column");
  - the `content-width` `usage` string in `packages/tokens/tokens.json`;
  - `apps/orasenda/src/features/routines/RoutinesPage.tsx` (the `width` prop only);
  - `routines.css` (drop `max-inline-size` at `:15`);
  - `apps/orasenda/src/features/inbox/InboxPage.tsx` (`width` prop) and `inbox.css` (drop `:12`);
  - `apps/orasenda/src/features/review/ReviewPage.tsx` (`width` prop) and `review.css` (drop `:15` only; `:134` is the shutdown flow, out of scope);
  - `apps/orasenda/src/styles/app.css` (`.settings-content` gains `margin-inline: auto`);
  - a new `verification/layout/contentWidth.spec.ts`.
- Touches: none.
- Interfaces:
  - Produces: `PageFrameProps.width?: "full" | "content"`.
- Acceptance:
  - [ ] With `width="content"`, the header, status row, region and footer each carry `w-full max-w-content-width self-center`.
  - [ ] Without the prop, the frame's markup and classes are unchanged (a snapshot of the class list).
  - [ ] The frame's `bg-surface` still fills the window.
  - [ ] At 1440 × 900, on Routines, Inbox and Review:
    - the header's right edge and the content's right edge differ by at most 4px (`space-1`);
    - the left and right gaps around the column differ by at most 1px;
    - `smallTargets` is empty;
    - no page scroll.
  - [ ] At 900 × 600 and 640 × 480 the pages look as today: the column is narrower than `content-width`.
  - [ ] Settings at 1440 × 900: the content column is centred in the space right of the index.
  - [ ] `page-frame.md` documents `width` and when to use it: reading pages, not Board or Calendar.
- Tests first:
  - `content_width_caps_and_centres_each_row` (page-frame);
  - `default_width_unchanged` (page-frame);
  - `content_column_centred_and_header_aligned` (layout, three pages);
  - `settings_content_centred_in_pane` (layout).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: no pill Button | U2 |
| Goal 2: `ring` only around the timer | U2 |
| Goal 3: DayPicker `radius-md` | U2 |
| Goal 4: ⋯ overflow everywhere | U3 (InboxRow, TaskCard), U4 (Routines) |
| Goal 5: one + create primary | U4, U5 |
| Goal 6: centred column, header aligned; Settings centred | U6 |
| Goal 7: ticked read-only done steps | U3, U4 |
| Goal 8: finished edge, 3:1 both themes | U3 |
| Goal 9: no repeated override | U2 |
| Goal 10: Reading context, superseded note | U1 |
| Goal 11: owner checklist | controller, after U6 |
| Failure mode: a finished routine with a skipped step | U4: `finished_routine_has_finished_card_with_all_done_steps_ticked` (fixture with one step not done: it stays hollow and the edge is still `break`) |
| Failure mode: an unknown `today` value | U3: `in_progress_card_keeps_routine_edge` also covers the fallback to `notStarted` (sand edge) |
| Failure mode: the Routines view fails to load | U4: `overview_has_one_primary_add` asserts no Add primary while the load error shows |
| Failure mode: a long item name in "More actions for <name>" | U4: `more_trigger_is_icon_named_for_item` uses a 120-character name and checks the full name |
| Failure mode: a narrow window with `width="content"` | U6: the 640 × 480 case in `content_column_centred_and_header_aligned` |
