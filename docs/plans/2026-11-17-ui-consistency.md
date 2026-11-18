# UI consistency — Implementation Plan

- Spec: [docs/specs/2026-11-17-ui-consistency.md](../specs/2026-11-17-ui-consistency.md)
- Date: 2026-11-17
- Status: done (2026-11-18)

## Overview
Seven tasks, each one PR. Tests are written first in every task. Every file stays at 500 lines or fewer, and every task passes `./scripts/ci.sh`. UI tasks get the opus design review; the owner reviews visuals, so there are no screenshots.

Design-system tasks (U2a, U2b, U3) come before the screens (U4, U5). U4 also owns `RoutineCard`'s finished edge, so the green edge lands with the ticked and Skipped steps and `main` never shows it over hollow boxes. U6 changes `PageFrame` and `ScrollRegion` and adopts them on the pages in one PR, so the props and their first consumers are reviewed together (conventions: "Design-system changes are checked against their first consumer").

`packages/ui/design-system/README.md` is edited by U2a, U3 and U6, in that order. `verification/contrast-pairs.json` is edited by U2a, then U4. `button.*` is edited by U2a, then U2b. No two parallel tasks touch the same file. U1 is docs only and runs any time.

| Task | What | Depends on | Wave |
|---|---|---|---|
| **U1** (#719) | "Reading context" rule; superseded notes in the routines spec | none | 1 |
| **U2a** (#720) | Shapes: `Button` radius; `IconButton` `ring`; `DayPicker` radius; docs and tests that name "round" or "pill" | none | 1 |
| **U2b** (#721) | `Button` `variant="inline"` and `size="row"`; their call sites | U2a | 2 |
| **U3** (#722) | Glyphs `more` and `plus`; read-only `RoutineItem` done and Skipped | U2a | 2 |
| **U4** (#723) | Routines: ⋯ menus, + Add, quiet Start, ticked and Skipped steps, finished edge | U3 | 3 |
| **U5** (#724) | Board: + Add task and the header gap | U3 | 3 |
| **U6** (#725) | `PageFrame` and `ScrollRegion` `width="content"`; Routines, Inbox and Review centred; Settings centred | U4 | 4 |

**Controller steps** (not sonnet tasks):
- After U3 merges and after U6 merges, the controller (or an opus agent) runs `just design-system` from `main` and republishes the live artifact with `"editing": "code"`. Follow the memory note "Design system publish".
- Before U4 and U6 start, the controller confirms the spec's "Owner calls to confirm" with the owner.
- After U6, the controller ticks the spec's Implementation status. The owner then runs the visual checklist in the spec's Testing strategy.

## Contract
- **U2a** owns:
  - `IconButtonProps.size: "md" | "ring"` (`"round"` removed);
  - `rounded-md` on every `Button` variant.
- **U2b** owns:
  - `ButtonProps.variant: "primary" | "break" | "quiet" | "ghost" | "critical" | "inline"`;
  - `ButtonProps.size: "md" | "lg" | "row"`.
- **U3** owns:
  - `IconName` gains `"more"` and `"plus"`;
  - `RoutineItemProps.skipped?: boolean`; `readOnly` honours `done` and `skipped`.
- **U4** owns:
  - `RoutineCard` sets `border-s-break` when `today === "finished"`;
  - the app `ActionMenu` props: `trigger: "more" | "add"` replaces `label: string`.
- **U6** owns:
  - `PageFrameProps.width?: "full" | "content"`;
  - `ScrollRegionProps.width?: "full" | "content"`.

## Impact
- **U2a changes `Button` and `IconButton`, which every screen uses.**
  - Removing `round` is a breaking type change. Its two callers (`features/today/Controls.tsx:62`, `full-screen-focus.tsx:264`) are updated in the same PR.
  - The existing `button`, `icon-button`, `start-button`, `floating-timer` and `full-screen-focus` component tests are the regression net.
  - Rollback is a revert.
- **U6 changes `PageFrame` and `ScrollRegion`.** Both props are optional and the defaults render as today, so Board, Settings and every other `ScrollRegion` user are untouched unless they opt in. Calendar doesn't use `PageFrame`.
- **No schema, IPC or permission change.**

## Dependency graph
```
U1 (independent)
U2a ──> U2b
U2a ──> U3 ──> U4 ──> U6
          └──> U5
```
Can start immediately in parallel: U1, U2a. After U2a: U2b and U3 in parallel. After U3: U4 and U5 in parallel.

## Tasks

### U1 (#719): Reading context and the superseded notes
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
  - [ ] In the routines spec, `> Superseded by [2026-11-17-ui-consistency](2026-11-17-ui-consistency.md) (Decision 4)` sits under Decision 41, under the Overview bullet (the "one primary action is Start" sentence), and under the canvas table that holds the "Routines page" row.
  - [ ] Nothing else in the routines spec changes (`git diff` shows only added lines).
- Tests first: none (docs). `./scripts/ci.sh` passes.

### U2a (#720): Shapes: Button and IconButton radius, `ring`, DayPicker
- Priority: 1
- Kind: ui (design system)
- Depends on: none
- Owns:
  - `packages/ui/src/components/ui/button.{tsx,md,test.tsx,specimen.tsx}` (the radius only);
  - `icon-button.{tsx,md,test.tsx,specimen.tsx}`, including the `icon-button-round` specimen at `icon-button.specimen.tsx:15,21`;
  - `day-picker.{tsx,md,test.tsx}` (`day-picker.md:3`) and its specimen if present;
  - `full-screen-focus.tsx` (`:264` `size="ring"`; the "round" comments at `:44,50`), `full-screen-focus.md` (`:17-19`) and `full-screen-focus.actions.test.tsx` (`:35,130`, `[data-size=round]` becomes `[data-size=ring]`);
  - `start-button.md`;
  - `floating-timer.md` and the comment at `floating-timer.tsx:23`;
  - `packages/tokens/tokens.json`: the `radius-md` and `radius-pill` usage strings, `control-lg` (`:134`, "the round Pause/Resume IconButton" becomes "the ring Pause/Resume IconButton") and `container-start-compact` (`:209`, "the pill" becomes "the button"), plus any generated file `just tokens` rewrites from it;
  - `verification/contrast-pairs.json`: the `where` texts at `:90,200,218,458` that say "round" or "pill" (wording only, no pair added or removed);
  - `packages/ui/design-system/README.md`:
    - the Layout radius line (`:50`);
    - the play-glyph line (`:138`, "floater's Start pill" becomes "floater's Start button");
    - the DayPicker row of the States table.
- Touches (comments or one line each): `apps/orasenda/src/features/today/Controls.tsx` (`:27` comment, `:62` `size="ring"`).
- Interfaces:
  - Produces: `IconButtonProps.size: "md" | "ring"`.
- Acceptance:
  - [ ] No `rounded-pill` in `button.tsx`. Every variant renders `rounded-md`.
  - [ ] `IconButton` `size="round"` no longer type-checks. `size="ring"` renders the old round look, `data-size="ring"`, and `icon-button.md` says it is only for Pause/Resume beside a `TimerRing` or in `FullScreenFocus`.
  - [ ] `DayPicker` toggles are `rounded-md`. `day-picker.md` and the README States row say "filled `focus` rounded rectangle" (on) and "`line-strong` outline" (off) in place of disc and ring.
  - [ ] The README Layout line reads: "`radius-sm` for fields and choices, `radius-md` for every button (primary included), icon button, toggle, card and block, `radius-lg` for dialogs and wells, `radius-pill` for information only: chips, tags, dots, tracks and the session-slot capsule. The one circular control is the `ring` Pause/Resume beside the timer ring."
  - [ ] The `tokens.json` usage strings say the same.
  - [ ] `button.md` drops "(pill, `focus` fill)".
  - [ ] `start-button.md` and `floating-timer.md` say "Start button" instead of "Start pill".
  - [ ] `grep -rn "round\"\|data-size=round\|icon-button-round" packages apps verification` finds no IconButton size use.
  - [ ] Every existing test passes and the hit targets are unchanged.
- Tests first:
  - `every_variant_is_rounded_md` (button);
  - `ring_size_is_round_control_lg` (icon-button, renamed from the round case);
  - `day_toggle_is_rounded_md` (day-picker).
- Notes:
  - Tokens only, no arbitrary values (`just tailwind-strict`).
  - The README and tokens text must not promise anything later tasks add.

### U2b (#721): Status-row actions: `inline` variant and `row` size
- Priority: 2
- Kind: ui (design system + call sites)
- Depends on: U2a (`button.*`)
- Owns:
  - `packages/ui/src/components/ui/button.{tsx,md,test.tsx,specimen.tsx}`;
  - `inline-notice.tsx` (the action button at `:73`) and `inline-notice.md` if it names the classes;
  - `apps/orasenda/src/features/today/StatusRow.tsx` (`:46`);
  - `apps/orasenda/src/features/inbox/InboxStatus.tsx` (`:55`).
- Touches: none.
- Interfaces:
  - Produces: `ButtonProps.variant` with `"inline"`, `ButtonProps.size` with `"row"`.
- Acceptance:
  - [ ] `variant="inline"`:
    - rest: clear border and ground, `text-focus`;
    - hover: `bg-surface-sunken`, `text-ink`;
    - pressed: `bg-selection`, `text-ink`;
    - disabled: the shared dashed look.
  - [ ] `size="row"` adds `flex-none px-3` and nothing else.
  - [ ] `InlineNotice`'s action, `InboxStatus`'s "Open Board" and `StatusRow`'s second action use the new variant and size; `StatusRow`'s quiet second action uses `size="row"` alone.
  - [ ] `grep -rn "flex-none px-3" apps packages/ui/src` finds no `Button` className override.
  - [ ] `button.md` documents `inline` and `row`.
  - [ ] Existing `StatusRow`, `InboxStatus` and `InlineNotice` tests pass unchanged.
- Tests first:
  - `inline_variant_has_focus_text_and_ghost_ground`;
  - `row_size_is_flex_none_px_3`.

### U3 (#722): Glyphs and read-only steps: `more`, `plus`, done and Skipped
- Priority: 1
- Kind: ui (design system)
- Depends on: U2a (README, `icon-button.specimen.tsx`)
- Owns:
  - `packages/ui/src/components/ui/icon.{tsx,md,test.tsx}` (and its specimen if present);
  - `inbox-row.tsx` (`:103` glyph only) and `inbox-row.md` if it names the glyph;
  - `task-card.tsx` (`:165` glyph only) and `task-card.md` if it names the glyph;
  - `icon-button.specimen.tsx` and `popover-menu.specimen.tsx` (`menu` becomes `more` where it stands for More actions);
  - `routine-item.{tsx,md,test.tsx}` (and its specimen if present);
  - `packages/ui/design-system/README.md`:
    - the Icon set line (`:139`): the count becomes 27, the list gains `more` and `plus`, and "`more` (⋯) is the overflow trigger; `plus` sits beside a create action's word" is added;
    - the RoutineItem row of the States table (read-only done: filled `break` box and tick; read-only skipped: dash and "Skipped"; no tab stop).
- Touches: none.
- Interfaces:
  - Produces: `IconName` includes `"more"` and `"plus"`;
  - Produces: `<RoutineItem readOnly done />` and `<RoutineItem readOnly skipped />`.
- Acceptance:
  - [ ] `more` is three round-capped dots on the horizontal centre line of the 20-unit grid at a 1.5 stroke. `plus` is a 13-unit cross centred on the grid. Both are `aria-hidden` in `currentColor`, like the rest of the table.
  - [ ] `InboxRow` and `TaskCard` More buttons draw `more`. Their names, tooltips, `tabIndex` and ⇧F10 are unchanged.
  - [ ] Read-only `RoutineItem`:
    - with `done`: a `bg-break border-break` box holding the `on-break` tick, an `ink-muted` label, and an `sr-only` "Done today: " before the label;
    - with `skipped`: a `line-strong` outline box holding a short dash, and a visible "Skipped" after the label in `text-label uppercase text-ink-muted`; no hidden prefix;
    - with neither: the hollow box, as today;
    - `done` wins over `skipped`;
    - in every case: no tab stop, no `checkbox` role, the label, detail and "Optional" stay exposed (no `aria-hidden` on them), and `data-state` is `done`, `skipped` or `open`.
  - [ ] The read-only row has `max-w-full` instead of `max-w-panel-width`. The checkbox form keeps `max-w-panel-width`.
  - [ ] The `routine-item` specimen shows open, done and skipped read-only rows, with a detail and "Optional" on one of them.
  - [ ] The READMEs are updated: `icon.md` and `routine-item.md`.
- Tests first:
  - `more_and_plus_glyphs_exist` (icon; also update any glyph-count assertion);
  - `inbox_row_more_uses_more_glyph`;
  - `task_card_more_uses_more_glyph`;
  - `read_only_done_shows_tick_without_checkbox`;
  - `read_only_done_is_not_a_tab_stop`;
  - `read_only_done_prefix_keeps_detail_and_optional_exposed` (the accessible text is "Done today: <label> <detail> Optional");
  - `read_only_skipped_shows_dash_and_word`;
  - `read_only_done_wins_over_skipped`;
  - `read_only_fills_width_checkbox_keeps_panel_width`.
- Notes:
  - The tick reuses the checkbox form's SVG path. Draw it once and share it, so the two forms can't drift.
  - The dash matches `RoutineStep`'s skipped mark (`routine-step.tsx`); read it, don't change it.
  - Forced colours: the done and skipped boxes keep their border.

### U4 (#723): Routines: ⋯ menus, + Add, quiet Start, ticked and Skipped steps, finished edge
- Priority: 1
- Kind: ui (design system + app)
- Depends on: U3
- Owns:
  - `packages/ui/src/components/ui/routine-card.{tsx,md,test.tsx,specimen.tsx}`;
  - `verification/contrast-pairs.json`: the `where` texts of `break` on `surface` (the timer arc pair) and `break` on `surface-raised` (`:491`, the floater half circle) gain "; RoutineCard finished edge". No pair is added;
  - `apps/orasenda/src/features/routines/ActionMenu.tsx`;
  - `RoutineList.tsx`;
  - `HabitList.tsx`;
  - `RoutinesPage.tsx` (the header primary, removal of `primaryStart`);
  - `routines.css`, only if the step grid needs to change for the icon trigger;
  - the routines tests whose names change from "More for X" to "More actions for X": `RoutinesPage.overview.test.tsx`, `RoutinesPage.writes.test.tsx`, `RoutinesPage.templates.test.tsx`, `useUndoRemove.test.tsx`, `HabitEditor.test.tsx` (`:96-235`) and `RoutineEditor.test.tsx` (`:27,212`);
  - `RunView.test.tsx` (one new assertion).
- Interfaces:
  - Consumes: `Icon name="more" | "plus"` (U3), `RoutineItem readOnly done skipped` (U3).
  - Produces: `ActionMenu({ id?, trigger: "more" | "add", name?, heading, items, onSelect })`.
- Acceptance:
  - [ ] `RoutineCard` has `border-s-break` with `today="finished"` and `border-s-routine` otherwise, including an unknown value (which falls back to `notStarted`). `routine-card.md` says "the edge turns `break` when finished; the words stay". The specimen shows notStarted, inProgress (some ticked) and finished (ticked plus one Skipped) cards.
  - [ ] `just contrast` passes in light and dark. The PR states the `break` / `surface-raised` and `break` / `surface` mark ratios in both themes.
  - [ ] `trigger="more"` renders an `IconButton` with `Icon name="more"` and `label={name}`, plus `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`.
  - [ ] Routine cards, steps and habits pass `name="More actions for <name>"`. Focus returns to the trigger by `moreId` after a move or Undo, as today.
  - [ ] `trigger="add"` renders a primary `Button` with `<Icon name="plus" />` and the word "Add", and `aria-label="Add a routine or habit"`. The menu items are unchanged. The visible label starts the name (WCAG 2.5.3).
  - [ ] Routine-row Start is `variant="quiet"` on every row. `primaryStart` and its export are removed, and the overview has exactly one `[data-variant="primary"]`.
  - [ ] Read-only steps get `done={habit.doneToday}` and `skipped={routine.today === "finished" && !habit.doneToday}`.
  - [ ] Empty state unchanged: the header "Start from a template" and the empty state's "Make your own".
  - [ ] `RunView` is not edited. A test asserts one primary while running and one when ended.
  - [ ] No "More" text appears on any trigger: `queryAllByText("More")` finds nothing.
- Tests first:
  - `finished_card_has_break_edge` and `in_progress_and_unknown_keep_routine_edge` (routine-card);
  - `overview_has_one_primary_add` (also: no Add primary while the load error shows);
  - `every_routine_start_is_quiet`;
  - `more_trigger_is_icon_named_for_item` (routine, step, habit; one with a 120-character name, checked in full);
  - `add_menu_opens_with_three_items`;
  - `in_progress_routine_ticks_done_steps_and_leaves_others_hollow`;
  - `finished_routine_ticks_done_steps_and_marks_others_skipped` (fixture "Done today, 1 of 2");
  - `run_view_has_one_primary_per_state`.
- Notes:
  - Fixtures already carry `doneToday` and `today`; use the builders in `shared/test/fixtures`.
  - Keep each test file under 500 lines. Split by behaviour if one would pass it.

### U5 (#724): Board: + Add task and the header gap
- Priority: 2
- Kind: ui (app)
- Depends on: U3
- Owns:
  - `apps/orasenda/src/features/board/BoardPage.tsx` (the header primary, `:235-240`);
  - `apps/orasenda/src/features/board/board.css`, only if extra spacing is found.
- Touches: the Board tests that query the "Add task" button by role and name; the name is unchanged, so they should pass as is.
- Interfaces:
  - Consumes: `Icon name="plus"` (U3).
- Acceptance:
  - [ ] The header primary is `<Button variant="primary"><Icon name="plus" />Add task</Button>`, with the accessible name "Add task".
  - [ ] At 900 × 600 and 1440 × 900, the top of the first column's box minus the bottom of `[data-slot=page-frame-header]` is at most `space-2 + hit-min + space-2 + space-1` (64px), the `PageFrame` contract.
  - [ ] If the measured gap is larger, the extra spacing is removed with tokens only, and the PR names what it was. If it already holds, the PR says the gap is the reserved status row (spec Decision 6) and changes no CSS.
  - [ ] Columns keep their `column-width` / `column-wide-width` caps and stay left-aligned.
- Tests first:
  - `add_task_has_plus_glyph_and_name` (BoardPage).

### U6 (#725): Content width: `PageFrame` and `ScrollRegion` `width="content"`; Settings centred
- Priority: 2
- Kind: ui (design system + app)
- Depends on: U4 (`RoutinesPage.tsx`, `routines.css`); U3 (README)
- Owns:
  - `packages/ui/src/components/ui/page-frame.{tsx,md,test.tsx,specimen.tsx}`;
  - `packages/ui/src/components/ui/scroll-region.{tsx,md,test.tsx}` (and its specimen if present);
  - the Layout `content-width` line of `packages/ui/design-system/README.md` (adds "Routines, Inbox and Review pass `width="content"` to `PageFrame` and `ScrollRegion`: the header, status row and region share one centred column, and the scrollbar stays at the window's edge");
  - the `content-width` usage string in `packages/tokens/tokens.json`;
  - `apps/orasenda/src/features/routines/RoutinesPage.tsx` (the `width` props only) and `routines.css` (drop `max-inline-size` at `:15` and `padding-inline-end` at `:16`);
  - `apps/orasenda/src/features/inbox/InboxPage.tsx` (the `width` props) and `inbox.css` (drop `:12` and `:15`);
  - `apps/orasenda/src/features/review/ReviewPage.tsx` (the `width` props) and `review.css` (drop `max-inline-size` at `:15` only; `:134` is the shutdown flow, out of scope);
  - `apps/orasenda/src/styles/app.css` (`.settings-content` gains `margin-inline: auto`).
- Touches: none.
- Interfaces:
  - Produces: `PageFrameProps.width?: "full" | "content"`, `ScrollRegionProps.width?: "full" | "content"`.
- Acceptance:
  - [ ] `ScrollRegion width="content"` wraps its children in `[data-slot=scroll-region-column]` with `mx-auto w-full max-w-content-width`. The region's own classes (padding, scrollbar, `overflow-y-scroll`) are unchanged.
  - [ ] `PageFrame width="content"`:
    - the header holds `[data-slot=page-frame-header-column]` and the status row holds `[data-slot=page-frame-status-column]`, each `mx-auto w-full max-w-content-width`;
    - each column sits in a `ps-2 pe-2` box that holds a `pe-scrollbar-size` box, so its insets equal the body's `p-1` plus the region's `p-1`, plus the scrollbar at the end;
    - the title, compact picker and primary sit inside the header column, `justify-between` as today.
  - [ ] Without the props, the markup and classes of both components are unchanged (a class-list assertion).
  - [ ] Layout, at 1440 × 900 and 900 × 600, on Routines, Inbox and Review (H = header column, S = status column, C = region column, R = the `ScrollRegion`, B = `[data-slot=page-frame-body]`, all from `getBoundingClientRect`):
    - |H.left − C.left| ≤ 1, |H.right − C.right| ≤ 1, and the same for S;
    - R.right = B.right − 4 ± 1 and R.left = B.left + 4 ± 1 (the region stays full width; the scrollbar is at the window's edge);
    - (C.left − (R.left + 4)) and ((R.right − 4 − scrollbar-size) − C.right) differ by at most 1 (centred);
    - the header's primary (where there is one) has its right edge within 1px of H.right, and the first card or row has its right edge within 1px of C.right;
    - every target is at least `hit-min`, and there is no page scroll.
  - [ ] At 640 × 480 the column fills R's content box, and the first focusable item's focus ring is fully inside R's padding box.
  - [ ] Settings at 1440 × 900: `.settings-content` is centred within its `ScrollRegion`'s content box (gaps differ by at most 1px). The title, the index and the save line keep their positions.
  - [ ] `page-frame.md` and `scroll-region.md` document `width`: reading pages pass it to both; Board does not.
- Tests first:
  - `content_width_wraps_header_and_status_in_inset_columns` (page-frame);
  - `content_width_wraps_children_in_centred_column` (scroll-region);
  - `default_width_unchanged` (page-frame and scroll-region).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: no pill Button | U2a |
| Goal 2: `ring` only around the timer | U2a |
| Goal 3: DayPicker `radius-md` | U2a |
| Goal 4: ⋯ overflow everywhere | U3 (InboxRow, TaskCard), U4 (Routines) |
| Goal 5: one + create primary | U4, U5 |
| Goal 6: aligned, centred column; full-width region; Settings centred | U6 |
| Goal 7: ticked and Skipped read-only steps, spoken prefix | U3, U4 |
| Goal 8: finished edge, 3:1 both themes, ships with the ticks | U4 |
| Goal 9: no repeated override | U2b |
| Goal 10: Reading context, superseded notes | U1 |
| Goal 11: owner checklist | controller, after U6 |
| Failure mode: a finished routine with a step not done | U4: `finished_routine_ticks_done_steps_and_marks_others_skipped` |
| Failure mode: an unknown `today` value | U4: `in_progress_and_unknown_keep_routine_edge` |
| Failure mode: the Routines view fails to load | U4: `overview_has_one_primary_add` (no Add primary while the error shows) |
| Failure mode: a long item name in "More actions for <name>" | U4: `more_trigger_is_icon_named_for_item` |
