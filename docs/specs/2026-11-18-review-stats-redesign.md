# Review page back to the approved canvas: Stats (4A) and overview (1A) — Spec

- **Status:** approved by pick (canvas picks 1A 2A 3A 4A 5B 6A, 2026-11-16); gap list written 2026-11-18
- **Date:** 2026-11-18
- **Owner:** the product owner (running app, 2026-11-18: the Stats habit rows from #760 are "incredibly ugly"; "we are not following the implementation of the claude design we did before for this")
- **Related:** [Reviews](2026-11-16-reviews.md) (behaviour and copy; this doc amends its Stats look, `:104` habit copy, `:169` and `:178`); canvas https://claude.ai/artifact/Qd5LDpoDcAPysGzzJhf6VX (frames `Main` = 1A, `Stats4A` = 4A, `Shutdown` = 2A, `Weekly` = 3A)
- **Sources of truth:** the canvas for how it looks; the reviews spec for behaviour and copy; the owner's later rulings (below) over both.

## TL;DR
- Stats looks like 4A again: the range switch sits on the heading's row; the chart is a compact group of 52px columns at the start of the column, not bars stretched across 720px; the caption sits under the chart; the goal words sit at the end of the chart at the goal's height.
- A habit is one sentence and its small dot grid on one row: "Drink a glass of water: done on 5 days this week." with a 7-column grid of 10px dots at the row's end. No bold name block, no second line.
- The Week goal is 1A/4A's goal row: "Focus", a `focus` track with its stubs, "Goal 12h" at the end, and the goal sentence under it.
- Text uses the canvas sizes: summary and routine lines in `body` `ink`, the estimate line in `body-sm`.
- The overview's headings carry their date ("Today · Friday 20 November"), the non-primary flow button is a secondary button on its line's row, as the canvas and the reviews spec say.
- Four design-system changes come first (TrendBars, a token, BarRow, HabitDots compact), then one Rust copy change, then the screens.

## Owner rulings that stand over the canvas
- The overflow glyph is the vertical ⋮ (#758). Not on this page.
- Legend never by colour alone: words beside shapes; one `HabitLegend` after the habit list (#760).
- One M–S weekday header over the habit list on the Week range (reviews spec `:169`, owner 2026-11-18, after 4A).
- `chart-height` stays 120px. The canvas plot is 120px too, so nothing to ask.
- Optional suggestions stay quiet: the buffer's *Use 40%* is `quiet` (InlineNotice README, V15b; [calm controls]). The canvas draws it secondary; see Owner calls.
- Accepted from the last checklist, not redone: ⋮ menus, Routines, the narrow habit wrap, 360 wide with no sideways scroll, the design-system pages.

## Gap list

Each row: what the canvas shows, what ships on main (a91b88b8), and the fix. "DS" marks a design-system change, made in `packages/ui` with its `.md` before any app CSS.

### Stats (canvas 4A, with 1A's Stats part)

| # | Part | Canvas | Ships | Fix |
|---|---|---|---|---|
| S1 | Heading row | `Stats` (h2) at the start, the segmented Week / 8 weeks / 6 months at the end of the same row | h2, then the switch on its own line below, at the start | One row, `justify-between`, wrapping under the heading when narrow (app CSS: layout only) |
| S2 | Rhythm | 12px (`space-3`) between every Stats part | `space-2` after the heading, `space-4` between parts | `space-3` |
| S3 | Summary | `body`, `ink` | `body-sm` (the shared `app-review-stats-lines`) | `body` `ink` |
| S4 | Week goal row | "Focus" · a `focus` fill on a `line` hairline track with the two `ink` stubs at its end · "Goal 12h" in the last column. 1A adds "9h 40m of a 12h goal." in `caption` under it | BarRow labelled "This week", the duration "9h 40m" in the last column, "Goal 12h" under the track | Label "Focus"; **DS:** BarRow goal words can sit in the last column (`goalWords="end"`), in place of the duration; the goal sentence (`goal.line`, from Rust) as a `caption` `ink-muted` line under the row, `aria-hidden` (the row speaks it) |
| S5 | Chart columns | 52px columns with `space-5` gaps, grouped at the start; 7 columns are 452px wide | `flex-1` columns spread across the whole 720px column (≈100px apart at 1440 and 1920) | **DS:** TrendBars columns are at most a new `chart-column-width` token (52px) and start-aligned with `space-5` gaps; in a narrow window they shrink (never below their label's longest word, which may overhang into the gap as today) |
| S6 | Bar shape | `radius-pill` ends; the top bar reaches about 93% of the plot (112 of 120px), leaving room for a stub above it | `rounded-sm`; the top bar fills 100% | **DS:** `rounded-pill`; scale to 93% of `chart-height` (the top value maps to `calc(100% - space-2)`) |
| S7 | Caption | Under the plot, `caption` `ink-muted`: "Focus each day this week" | Above the plot, `body-sm` | **DS:** caption under the plot, `caption` size. Copy stays the reviews spec's ("Focus time by day" / "by week" / "by month") |
| S8 | Goal on 8 weeks | Stubs 6px long, 4px clear of the bar on each side; "Goal 12h" once, at the end of the plot row, at the goal's height | Stubs up to `icon-sm` (10px); words under the plot, at its end | **DS:** stubs `1-5` (6px) long with `space-1` clear of the fill; the words at the plot's end, centred on the goal height, after the last column |
| S9 | Routine lines | `body` `ink`, one per line | `body-sm` | `body` `ink` |
| S10 | Habit row | One sentence in `body` `ink` ("Drink a glass of water: done on 5 days this week.") at the start; a 7-column grid of 10px dots with 4px gaps at the end, centred on the row | A bold name line, then "Done on 5 days this week." in `body-sm` `ink-muted`, then 14px dots with fluid gaps | Rust says the whole sentence (R1); the app prints one `body` line; **DS:** `HabitDots compact` draws `icon-sm` dots with `space-1` gaps and `HabitWeekdays` matches that cell; the row keeps the narrow wrap the owner accepted |
| S11 | Habits on 8 weeks / 6 months | The sentence only | The bold name and the line | The sentence only (R1) |
| S12 | Estimate line | `body-sm` `ink` | `body-sm` `ink-muted` | `body-sm` `ink` |
| S13 | Buffer suggestion | Bordered `surface-raised` notice, *Use 40%* secondary, *Not now* quiet | InlineNotice (default variant), both quiet | Kept (owner ruling on optional controls). Owner call 2 |
| S14 | Empty range | Labels only, no zero bars | Same | — |

### Overview (canvas 1A)

| # | Part | Canvas | Ships | Fix |
|---|---|---|---|---|
| O1 | Section headings | "Today · Friday 20 November", "This week · Planning the week of 23 November" as the h2 | h2 "Today", then the day label as a separate line | h2 = `Today · {dayLabel}` and `This week · {week.label}` |
| O2 | Today's line and button | "Ready when you are." (`body` `ink`) with **secondary** *Start shutdown* at the end of the same row | `body-sm` `ink-muted` line, a **quiet** button on its own line under it | Line in `body` `ink`; the non-primary flow's button is `secondary` (reviews spec `:169` says secondary too) on the line's row, wrapping under it when narrow. *Look again* after completion stays quiet (Owner call 4) |
| O3 | This week's line | "Not planned yet." `body` `ink-muted` | `body-sm` `ink-muted` | `body` `ink-muted`; priorities list unchanged |
| O4 | Section rhythm | `space-6` between sections, `space-2` inside | Same | — |

### Flows (canvas 2A and 3A)

| # | Part | Canvas | Ships | Fix |
|---|---|---|---|---|
| F1 | Look-back habit lines | "Drink a glass of water: done on 5 days this week." | "Done on 5 days that week." with no habit name: two habits read the same | R1 adds the name |
| F2 | Look-back parts | Sub-headings "Focus by task" over the task bars and "Your shutdown notes" over the echoes | No sub-headings | Two `h2` sub-headings (`heading` type) in the look-back |
| F3 | Look-back chart | Same TrendBars look as Stats | Spread columns | Follows S5–S8 with no app change |
| F4 | Shutdown toggle | *Back to Backlog* has a `line-strong` border at rest; pressed: `ink` border, `surface-raised`, a tick | Quiet (no border) at rest; pressed: `focus` border, `selection` ground, a tick | At rest a `secondary` Button; pressed keeps today's tick, `aria-pressed` and ground. Rows get a `line` hairline under each, as 2A |

### Rust (copy)
- **R1.** A habit sentence names its habit, like a routine line: "Drink a glass of water: done on 5 days this week.", "…: done on 1 day since 3 November.", "…: no check-ins this week." Same for the look-back ("…: done on 4 days that week."). `words::habit_line` and `look_back_habit_line` take the name; the banned-words test still runs. Amends reviews spec `:104` ("Done on 9 days this week" becomes "Stretch: done on 9 days this week"). `HabitStat.name` stays (the grid's spoken name uses it).

## Design-system changes (reuse first)
- **TrendBars** (`trend-bars.tsx`, `.md`): S5–S8. New token `chart-column-width` 52px in `tokens.json` (size group, usage "Widest a TrendBars column gets"). No new props.
- **BarRow** (`bar-row.tsx`, `.md`): optional `goalWords?: "under" | "end"`, default `"under"` (today's look-back stays as is). With `"end"` the goal words take the third column and the duration is not drawn; the README's "track length never depends on the copy" note gains the exception.
- **HabitDots** (`habit-dots.tsx`, `.md`): `compact` draws `icon-sm` dots with `space-1` gaps; `HabitWeekdays` cells match (`icon-sm` wide, `space-1` gaps), so header and grids still line up. The today ring keeps its offset. The full (non-compact) grid on Routines is unchanged.
- Reused unchanged: `ChoiceGroup` segmented, `InlineNotice`, `HabitLegend`, `Button` (`secondary`, `quiet`), `PageFrame`, `ScrollRegion`.

## Tasks (stack order; each branches from the one before)
1. **D1 Design system: TrendBars as canvas 4A** — S5–S8, the token, README, tests.
2. **D2 Design system: BarRow goal words at the end; compact habit dots at 10px** — S4's DS part, S10's DS part, READMEs, tests.
3. **R1 Service: habit sentences name the habit** — R1, words tests, look-back and stats tests.
4. **S Screen: Review Stats as canvas 4A** — S1–S4, S9–S12 in `StatsSection.tsx` and `review.css`; tests in `ReviewPage.stats.test.tsx`.
5. **O Screen: Review overview and flows as canvas 1A, 2A, 3A** — O1–O3, F2, F4; tests in the overview, shutdown and weekly test files.

Every task: tokens only, both themes, focus ring, `hit-min`, vitest only (no browser tests), `./scripts/ci.sh` green, files under 500 lines.

## Owner calls (built canvas-closest unless the row says otherwise)
1. **Done dot colour.** 4A fills done dots with `routine` (sand); the system and Routines use `break` (green). Kept `break`, so a habit reads the same on Routines and Review; say "routine" to switch both.
2. **Buffer *Use 40%*.** The canvas and the reviews spec draw it `secondary`; the InlineNotice rule (V15b) and your calm-controls ruling make an optional suggestion's accept `quiet`. Kept quiet.
3. **Weekday header and legend.** 4A has neither; your 2026-11-18 rulings added both. Kept, restyled to the 10px grid.
4. ***Look again*** after a completed shutdown or review: the canvas has no completed state. Kept quiet.
5. **Dot size.** Built at 10px as 4A. If the hollow, dashed and dotted shapes are hard to tell apart at that size, 14px is the fallback.
6. **Goal sentence under the Week goal row.** 1A shows "9h 40m of a 12h goal." under the row; 4A doesn't. Built as 1A.

## Not in scope
Board files and spec B, the ⋮ menus, Routines, the design-system publish (after the owner merges), browser or layout tests.

[calm controls]: the owner's 2026-11-14 ruling: optional choices behind quiet controls.
