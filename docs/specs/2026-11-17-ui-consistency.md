# UI consistency: button shapes, overflow menus, page width and finished routines — Spec

- **Status:** draft
- **Date:** 2026-11-17
- **Owner:** the product owner (request of 2026-11-17, reviewing the macOS app)
- **Related:** [Routines and habits](2026-11-14-routines-and-habits.md) (Decision 41 is superseded here); [code-first components](2026-11-10-code-first-components.md); spec B, Board columns (to be written)
- **Plan:** [docs/plans/2026-11-17-ui-consistency.md](../plans/2026-11-17-ui-consistency.md)

## TL;DR
- Text buttons are never pills. Every `Button` variant, primary and break included, uses `radius-md`. Pills are for information only: chips, tags, dots, tracks (owner).
- An overflow menu is a ⋯ `IconButton` everywhere, never the word "More". A page's create action is one pattern: a primary `Button` with a + glyph and a label.
- Routines, Inbox and Review centre their 720px column, and the page header lines up with it. Settings centres its content column in its pane. Board stays left-aligned at its column widths.
- A finished routine reads as done: its steps are ticked, its edge is `break` green, and the words "Done today, N of N" stay.
- Small cleanups: one primary per Routines screen, a named `inline` Button variant and `row` size for status-row actions, and a "Reading context" rule in `docs/conventions.md`.

## Change in a nutshell
On the Routines page at 1440 × 900 today, the cards sit at the left in a 720px column. The header's "Add" text button sits at the far right edge. Each card shows a pill "Start" (primary on one card, quiet on the rest) and a "More" text button. A routine finished today shows hollow step boxes and a sand edge.

After this change:
- The header, status row and cards share one centred 720px column. The header ends in **+ Add**, the page's only primary. It is a rounded rectangle and opens the same menu as before (New routine, From a template…, New habit).
- Every card's **Start** is a quiet rounded rectangle. Every "More" is a 44px ⋯ icon button with the tooltip and spoken name "More actions for Morning Light".
- A finished routine has a green start edge, a ticked box on every step done today, and the line "Done today, 5 of 5". A partly done routine ticks only its done steps and keeps the sand edge.

The general rule: **a control's shape says what it is.** A rounded rectangle (`radius-md`) is something you press. A pill (`radius-pill`) is information. A circle is a mode or a mark, plus one exception: the Pause/Resume button beside the timer ring.

## Problem
The owner reviewed the macOS app on a wide window and reported four problems:
- **Wasted space.** Wide windows leave big empty space, and the header action sits far from the content it belongs to.
- **"More" as a word.** A "More" text button on every routine row is confusing.
- **Mixed shapes.** Primary buttons are pills while the others are rounded rectangles: "a text button with different shapes just seems wrong… pills are better suited for information like tags".
- **Finished routines don't look finished.** A finished routine shows empty checkboxes ("makes me think they are not completed") and keeps its sand edge.

The owner asked us to look at how Linear handles space, to apply what makes sense, and to fix anything else that makes sense. These are the first impressions of every screen, so they come before the 0.3.0 release.

## Goals / Success criteria
1. No `Button` variant renders with `radius-pill`. `button.test.tsx` asserts `rounded-md` for every variant.
2. `IconButton` has no `round` size. Its circular size is `ring`, used only by Pause/Resume on Today and in `FullScreenFocus`.
3. `DayPicker` toggles render with `radius-md`.
4. No visible "More" text appears on a trigger in the app. Every overflow trigger is an `IconButton` with `Icon name="more"`, named "More actions for <item>". This covers routine cards, routine steps, habits, Inbox rows and task cards.
5. Board and Routines headers each end in one primary `Button` with `Icon name="plus"` and a visible label. No other primary shows on the Routines overview.
6. At 1440 × 900, on Routines, Inbox and Review, the header's right edge and the content's right edge differ by at most `space-1`. The column is centred: the left and right gaps differ by at most 1px. On Settings, the content column is centred in its pane.
7. A routine step done today renders a filled `break` box with an `on-break` tick, with no tab stop and no checkbox role. VoiceOver reads it as "Done today: <step>".
8. A `RoutineCard` with `today="finished"` has a `break` start edge. The `break` pairs on `surface-raised` and on `surface` hold 3:1 as marks in light and dark (`just contrast`).
9. `flex-none px-3 text-focus` no longer appears in `apps/` or `packages/ui/src`.
10. `docs/conventions.md` has the "Reading context" rule, and Decision 41 of the routines spec carries a superseded note.
11. `./scripts/ci.sh` passes, and the owner's visual checklist (Testing strategy) passes in both themes.

## Non-goals
- **Board columns (spec B).** Renaming a column in the UI, custom columns, sideways scroll, and the per-column + and ⋯ header actions all belong to spec B.
- **Moving the Board's status line into its header row.** The vertical gap above the columns is mostly the reserved status row (Decision 6). Changing that is a `PageFrame` change for spec B, if the owner still wants it.
- **Flows.** `FlowStep` (shutdown, weekly review, routine run) and Today keep their current width and alignment. A centred flow can follow once the owner has seen the centred pages.
- **Calendar.** Its tray and day grid fill the window by design.
- **Rewriting design-system internals.** Components that hand-roll a `<button>` (rows, tabs, strips) are only checked against the shape rule (see Decision 2); none is rewritten.
- **A short tooltip separate from the spoken name.** `IconButton` uses one `label` for both (see FAQ).

## Approaches
- **Content width: centre the column with a `PageFrame` prop, let pages fill the window, or centre each page in its own CSS.**
  - Filling a 1440px window puts text past the 65-character measure, and cards stretch.
  - Per-page CSS is how the misalignment started: four pages each cap the body, and none of them caps the header.
  - A `width="content"` prop on `PageFrame` caps the header, status row and region together, in one place, with the existing `content-width` token.
  - **Picked: the `PageFrame` prop (author's call),** because it fixes the alignment for every page at once.
- **Overflow trigger: the word "More", a ⋯ icon, or the existing `menu` (≡) glyph.**
  - The word reads as a button among buttons.
  - ≡ means navigation on macOS and the web.
  - ⋯ is what Linear, macOS toolbars and most apps use for "more actions on this thing".
  - **Picked: ⋯ (author's call).**
- **Button shape: all pills, all rounded rectangles, or pills for primary only (today).**
  - **Picked: all rounded rectangles (owner).**

What we took from Linear:
- Content pages and settings use a centred, readable column, and the header aligns with it.
- The board's columns have fixed widths and are left-aligned. Empty space to their right is normal.
- Overflow is a ⋯ icon button with a tooltip.
- Create actions carry a +.
- Every button is a rounded rectangle, and pills mark labels.

## Users & permissions
One person, on their own device. No roles.

| Role | Can | Cannot |
|---|---|---|
| The person using the app | Everything on these screens, as today | n/a |

## Tenancy & localization
n/a for tenancy: local-first, one user. Copy is English, as today.
- Layout uses logical properties (`border-s`, `margin-inline`), so the start edge and centring hold in right-to-left text.
- Names that include an item's title ("More actions for <item>") wrap and never truncate the accessible name.

## Domain model
No change. A step's done state comes from the existing `HabitView.doneToday: boolean`, already in `RoutineView.habits` (`shared/ipc/bindings.ts`). A routine's state comes from the existing `RoutineView.today` and `todayLine`. There is no backend change.

## Interfaces
All changes are props on design-system components plus one app component.
- **`Button`** (`packages/ui/.../button.tsx`)
  - Every variant uses `rounded-md`.
  - `variant` gains `"inline"`: the ghost look, with `focus` text at rest. On hover it uses a `surface-sunken` ground with `ink` text, and on press a `selection` ground, as ghost does. It is for an action that sits in a line of text or a status row ("Open Board", "Got it").
  - `size` gains `"row"`: `flex-none` and `px-3`, for an action inside a status row or an `InlineNotice`.
  - The type becomes `variant?: "primary" | "break" | "quiet" | "ghost" | "critical" | "inline"; size?: "md" | "lg" | "row"`.
- **`IconButton`**
  - `size: "md" | "ring"`. `ring` replaces `round` with the same look (52px `control-lg` circle, `surface-raised`, `line-strong` edge).
  - It is allowed only for Pause/Resume beside a `TimerRing` or in `FullScreenFocus`, where it echoes the ring.
- **`Icon`** gains two glyphs on the 20-unit grid at a 1.5 stroke:
  - `more`: three dots in a row (⋯), drawn as round-capped zero-length strokes like `jump`'s dots. It means "more actions for this item".
  - `plus`: a cross. It means "add or create", always beside a word.
- **`DayPicker`** toggles use `rounded-md`.
  - On: a filled `focus` rounded rectangle.
  - Off: a `line-strong` outline.
  - Only the corner radius changes; the states are otherwise the same.
- **`InboxRow` and `TaskCard`.** The More actions button uses `Icon name="more"` instead of `menu`. Names, tabIndex and ⇧F10 are unchanged.
- **`RoutineItem` with `readOnly`.**
  - With `done`, the box is a filled `break` square with the `on-break` tick, and the label turns `ink-muted`, as in the checkbox form.
  - With `name`, a visually hidden span carries the name and the visible text is `aria-hidden`.
  - The read-only row fills its container (`max-w-full`, not `max-w-panel-width`). The checkbox form keeps `max-w-panel-width`.
- **`RoutineCard`.** With `today="finished"`, the start edge is `border-s-break`; otherwise it stays `border-s-routine`. The shape and the words are unchanged.
- **`PageFrame`** gains `width?: "full" | "content"` (default `"full"`). With `"content"`, the header, status row, region and footer each get `w-full max-w-content-width self-center`. The frame's background still fills the window.
- **App `ActionMenu`** (`features/routines/ActionMenu.tsx`) takes `trigger: "more" | "add"` in place of the visible `label`.
  - `"more"`: an `IconButton` with `Icon name="more"`. `name` is its label ("More actions for <item>").
  - `"add"`: a primary `Button` with `Icon name="plus"`, the visible word "Add", and the accessible name "Add a routine or habit".
  - Both keep `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`. The component stays in the app, because only the Routines feature uses it.

## Behavior & edge cases
- **Routines overview.**
  - The header primary is **+ Add** whenever the list loaded and isn't empty.
  - The empty state is unchanged: the header primary "Start from a template" and the empty state's "Make your own".
  - Each routine's Start is `quiet`. Start is hidden once the routine is finished, as today.
- **Partly done routine.** Ticked steps for the habits with `doneToday`, hollow boxes for the rest, the sand edge, and the line "2 of 5 done today".
- **Finished routine with a skipped step.** `today="finished"` and the green edge. The skipped step stays hollow, because no check-in is stored for a skip. The line "Done today, 4 of 5" says what happened.
- **A check-in made elsewhere** (run view, a habit's Done today) shows on the next view the page receives, as today. There is no new event.
- **RunView.** It already shows exactly one primary in each state: Done while running, Back to routines when ended. Skip for today stays quiet and End routine ghost. No change; a test pins it.
- **Board.**
  - Columns keep the `column-width` and `column-wide-width` caps and stay left-aligned.
  - The status row stays reserved, because undo lines appear mid-move and a collapsing row would shift the drop targets.
  - The gap from the header to the columns is held to the `PageFrame` contract: `space-2` + `hit-min` + `space-2` + `space-1`. Any extra spacing found is removed.
  - The header primary becomes **+ Add task**.
- **Compact windows.**
  - `width="content"` changes nothing below 720px of frame width.
  - The compact picker still takes the header's free width.
  - Hit targets stay `hit-min`.
- **Reduce motion.** No new motion. Buttons keep `duration-quick` transitions, removed under reduce-motion.
- **Forced colours.** Buttons keep their 1px border, so the shape survives. The done box in a read-only step keeps its border.

## Data & migrations
None.

## Testing strategy
- **Unit** (Vitest, beside each component). Tests first in each task; the plan names them. Shape assertions read the class list. Names and roles use Testing Library queries.
- **Layout** (Playwright WebKit, `verification/layout/`):
  - At 900 × 600 and 1440 × 900, the content-column alignment on Routines, Inbox and Review.
  - The Board's header-to-column gap.
  - `smallTargets` is empty on the changed pages.
- **Contrast.** `just contrast` checks `break` as a mark on `surface-raised` and on `surface`, in both themes.
- **Owner's visual checklist** (no screenshots in PRs). Check light and dark, at 900 × 600 and 1440 × 900:
  - [ ] Today: Start focus is a rounded rectangle. Pause/Resume beside the ring is still a circle.
  - [ ] Focus window: the same as Today. The floater's Start is a rounded rectangle.
  - [ ] Board: **+ Add task** is a rounded rectangle with a plus. Task cards' ⋯ menus work. The gap above the columns looks right.
  - [ ] Routines: **+ Add** in the header lines up with the cards' right edge. Every Start is quiet. Routines, steps and habits each have a ⋯ with a tooltip.
  - [ ] A finished routine: a green edge, every done step ticked, and "Done today, N of N".
  - [ ] A partly done routine: done steps ticked, a sand edge.
  - [ ] Routine editor: the day toggles are rounded rectangles, on and off.
  - [ ] Inbox and Review: the column is centred and the header aligns with it. Inbox rows have ⋯.
  - [ ] Settings: the content column is centred in its pane.
  - [ ] Status-row actions ("Open Board", "Got it") look as before.
  - [ ] Chips, tags, habit dots and progress bars are still pills.
  - [ ] Keyboard focus rings are visible on every changed control.
  - [ ] VoiceOver: each ⋯ reads "More actions for …". A done step reads "Done today: …".

## Decisions
1. **Text buttons are never pills (owner).**
   - Every `Button` variant uses `radius-md`, primary and break included. Pills are information only: mode chips, tag chips, habit dots, routine-step marks, bar rows, timer-strip tracks, the now-line dot, the intent prompt's breathing circle, the scroll thumb, and the session-slot capsule (a status readout).
   - The radio circle in `Choice` and `PopoverMenu` stays round by convention.
   - Updated together: `button.tsx` and `button.md`; the `radius-md` and `radius-pill` usage text in `tokens.json`; the shape line in the design-system README; and the "Start pill" wording in `start-button.md`, `floating-timer.md` and the README's play-glyph line.
2. **`IconButton` `round` becomes `ring`, allowed only around the timer (author's call).**
   - Its only users are Pause/Resume on Today (`features/today/Controls.tsx`) and in `FullScreenFocus`. Both sit beside circular content, so they keep the circle under a name that says where it belongs. `icon-button.md` states the rule.
   - `DayPicker` toggles are text controls, so they become `radius-md` (author's call).
   - Audit of the components that hand-roll a `<button>`:
     - `import-source-picker`, `settings-index`, `settings-nav`, `shortcut-recorder` and `task-picker` use `radius-sm` or `radius-md` and comply.
     - `kanban-column` and `time-block` use `radius-md` or `radius-lg` and comply.
     - `nav-rail` has no radius.
     - `tag-field`'s round remove button stays round, because it is a mark inside an information chip.
     - Only `day-picker` changes.
3. **Overflow menus are a ⋯ `IconButton` (author's call, from Linear).**
   - A new `more` glyph is added, because no existing glyph fits: `menu` is ≡.
   - The spoken name and tooltip is "More actions for <item>", the wording `InboxRow` and `TaskCard` already use. This deviates from "More for <item>" (see FAQ).
   - It applies to routine cards, routine steps, habits, Inbox rows and task cards.
   - `ActionMenu` stays in the app: only Routines uses it.
4. **One create pattern and one primary per screen (author's call).**
   - A page header's create action is a primary `Button` with the `plus` glyph and a label: Board **+ Add task**; Routines **+ Add**, which opens the existing menu (New routine, From a template…, New habit).
   - "Add" is picked over "New" because Board, the palette and the empty states already say "Add task". Renaming them would only churn copy and tests.
   - The routine-row Start is `quiet` on every row. This supersedes Decision 41 of the routines spec.
   - `RunView` already has one primary per state and is unchanged.
   - Empty states keep their current actions.
5. **Content pages centre their column, and the header aligns with it (author's call, from Linear).**
   - `PageFrame width="content"` is used on Routines, Inbox and Review. The per-page `max-inline-size: var(--content-width)` rules in `routines.css`, `inbox.css` and `review.css` (`.app-review-body`) are removed.
   - Settings keeps its full-width frame, because its index sits at the left. Its `.settings-content` column centres in the pane with `margin-inline: auto`, as Linear's settings do.
   - Tokens only: `max-w-content-width`.
6. **The Board keeps its width and alignment (author's call, from Linear).**
   - Columns keep the 280 / 440 caps, stay left-aligned, and leave empty space to the right.
   - Only the header-to-columns gap is checked against the token contract, and any extra is removed. The reserved status row stays (see Behavior).
   - Per-column + and ⋯ belong to spec B.
7. **A finished routine reads as done (owner, with author's details).**
   - Steps done today render ticked: read-only, no tab stop, no checkbox role, spoken "Done today: <step>".
   - The card's edge is `break` when `today` is finished.
   - The words "Done today, N of N" stay, so state is never shown by colour alone.
   - Partly done routines tick their done steps.
   - Contrast: the edge is a mark next to `surface-raised` (the card) and `surface` (the page). The plan's first design-system task adds both `break` pairs as marks to `verification/contrast-pairs.json`. `break` on `surface` is already declared for the timer arc. Both must hold 3:1 in light and dark, and the PR says the measured ratios.
   - Author's extra fix: read-only steps fill the card's width instead of `panel-width`. The read-only form is used only inside `RoutineCard`, so nothing else changes.
8. **The repeated `flex-none px-3 text-focus` override becomes `variant="inline"` plus `size="row"` (author's call).**
   - Look and layout are separate props, so the quiet second action in `StatusRow` uses `size="row"` alone.
   - This covers `InboxStatus.tsx`, `today/StatusRow.tsx` and `InlineNotice`'s own action button.
9. **"Reading context" in `docs/conventions.md` (author's call).**
   - Current rules live in living docs: the design-system README, the component `.md` files, `DECISIONS.md`, `CONTEXT.md` and the conventions. Specs are history: grep them, and never read them whole.
   - A reversed decision gets `> Superseded by <spec> (Decision N)` under it in the source spec, in the same PR. The reversed decisions here are routines Decision 41 and its overview sentence and canvas row.
   - Upstream: JCIOriente/baton#207.

No ADR is needed: these are design-system rules, recorded in the README and component docs. No new `CONTEXT.md` terms.

## FAQ
### Why "More actions for <item>" and not "More for <item>" with a tooltip "More"?
`IconButton` uses one `label` as both its accessible name and its tooltip, and `InboxRow` and `TaskCard` already say "More actions for <item>". A short tooltip with a longer name would need a new `IconButton` prop and would change two shipped components. One wording everywhere is simpler, and the item's name in the tooltip says which item the menu is for.

### Why keep one circular button?
The Pause/Resume button sits on the axis of a circular ring and is the one control there. A rounded rectangle against the ring reads as a misfit, and it is not a text button. The `ring` name keeps it from spreading.

### Why not collapse the Board's empty status row?
Undo lines ("Moved … Undo") appear while you move cards. A row that appears and disappears would push the columns down mid-drag, under the pointer. A reserved row is the calmer choice.

### Why not centre the Board too?
The columns grow from the left as you read them: Backlog, Today, Doing. Centring would move every column whenever one folds, and Linear's board keeps the same fixed, left-aligned columns.

## Open questions
None.

## Implementation status
Updated by the PRs that implement this spec.
- [ ] U1 Reading context and the superseded note
- [ ] U2 Shapes: Button, IconButton `ring`, DayPicker, `inline` and `row`
- [ ] U3 Glyphs and done steps: `more`, `plus`, read-only done steps, finished edge
- [ ] U4 Routines: ⋯ menus, + Add, quiet Start, ticked steps
- [ ] U5 Board: + Add task and the header gap
- [ ] U6 Content width: `PageFrame width="content"` on Routines, Inbox and Review; Settings centred
- [ ] Controller: republish the design-system artifact after U3 and after U6 merge
