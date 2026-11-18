# Board columns: rename, custom columns, sideways scroll and column menus — Spec

- **Status:** draft
- **Date:** 2026-11-18
- **Owner:** the product owner (decisions approved 2026-11-18)
- **Related:** [Board](2026-11-14-board.md) (Decisions 1 and 18 are superseded here; closes #584); [Board polish](2026-11-15-board-polish.md); [UI consistency](2026-11-17-ui-consistency.md) (spec A, the overflow-menu pattern)
- **Plan:** to be written (`docs/plans/2026-11-18-board-columns.md`)

## TL;DR
- Each column header gets a **+** (a new-task field at the top of that column) and a **⋯** menu: *Rename column*, *Set limit*, *Add column after*, *Fold column*, *Remove column*.
- **Rename in place:** the heading becomes a text field; Enter saves, Esc cancels, 1–24 characters. Nothing on screen renames columns today.
- **Up to 4 custom columns** sit between the four built-ins (Backlog, Today, Doing, Done), which stay fixed in order and meaning. A custom column is a plain stage: a name and an optional limit that informs, never blocks. It can be removed only when empty.
- **The board scrolls sideways** and never folds by itself. Done still starts folded; any column folds by hand.
- **Storage:** the `board.columns` setting becomes the ordered list of all columns; migration 0011 relaxes `task.lane`'s CHECK so a task can sit in a custom column. No new table.

## Change in a nutshell
Board at 900 × 600 with two custom columns (Waiting after Today, Review after Doing). Each open column is at `column-min-width`, so the row scrolls; at 1440 × 900 the same six fit without scrolling:

```
 Board                                                               [ + Add task ]
 ┌ Backlog ────────┐ ┌ Today ──────────┐ ┌ Waiting ────────┐ ┌ Doing ──────
 │ 6 tasks  [+][⋯] │ │ 2 of 3   [+][⋯] │ │ 1 task   [+][⋯] │ │ At limit  [+
 │ [New task…    ] │ │ ◆ Write intro   │ │ ○ Reply from Ana│ │ ◆ Fix sync b
 │ ○ Book dentist  │ │ ○ Draft outline │ │                 │ │
 └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────
 ═════════════════▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬════════════════════════════════
                          (always-drawn sideways scrollbar)
```

The header is two rows: the name, then the count with + and ⋯. The ⋯ menu on Waiting, and Rename in place:

```
 ┌ Waiting ───────────────────┐      ┌ [Waiting on others|  ] ┐  Enter saves · Esc cancels
 │ Rename column              │      │  1 to 24 characters.   │
 │ Set limit…                 │      │ 1 task          [+][⋯] │
 │ Add column after           │
 │ Fold column                │      At the cap:  Add column after   (dimmed)
 │ Remove column   (dimmed)   │                   Up to 4 extra columns.
 │   Move its tasks out first.│
 └────────────────────────────┘
```

In general: every open column has the same header controls; what differs is which menu items apply (see [Column menu](#column-menu)).

## Problem
The Board's four columns are fixed (Board Decision 1), their names can't be changed on screen although the service supports it (`board_columns_set` has no caller: `apps/orasenda/src/features/board/useBoard.ts:113-117`), and their limits can't be set either. People who work with a waiting or review stage have nowhere to put it. The board also folds columns by itself when the window narrows (`useFolds.ts`, `useRoom.ts`), which hides work without the person asking.

## Goals / Success criteria
1. From a column's ⋯ menu the person can rename any open column, set the limit of Today, Doing and any custom column, add a custom column after any column but Done, fold any column, and remove an empty custom column.
2. A custom column can hold, receive and give up tasks exactly like Backlog or Today: add, drag, ⌥⌘←/→, the card's *Move to* menu, the task sheet's column choice.
3. At 4 custom columns, *Add column after* is disabled and says "Up to 4 extra columns."; the service refuses a fifth.
4. *Remove column* is disabled with "Move its tasks out first." while the column holds a task; the service refuses removing a non-empty or built-in column.
5. At any regular window size, no column folds unless the person folds it; when the open columns don't fit at `column-min-width`, the board scrolls sideways with an always-drawn scrollbar. Done starts folded.
6. Keyboard: arrows reach every column, strip and header control, empty columns included, and the focused column is scrolled into view.
7. The header's + opens a new-task field at the top of that column; the page's *Add task* still adds to Backlog.
8. A database at schema 10 migrates to 11 with every task, index and CHECK kept; exports and merge carry custom lanes.

## Non-goals
- Reordering columns, or moving a custom column after it is made (owner call 6).
- Removing, reordering or renaming the meaning of a built-in column.
- A column with its own behaviour (auto-move, timers, Done-like semantics). A custom column is a plain stage.
- Saving which columns are folded across launches (owner call 4).
- Merging two devices' column edits field by field (owner call 12).
- The compact (stacked) board's layout: it stays a vertical stack in a `ScrollRegion`; custom columns appear in it in board order.
- Pointer drag of columns.

## Approaches
The owner chose the shape on 2026-11-18 (the seven decisions below). The build approach is the author's call:
- **Granular column commands vs. one `board_columns_set`:** `board_columns_set` takes the whole list, so "remove only when empty", "at most 4" and id generation would be checked against a list the client built from a possibly stale view. Granular commands (`board_column_add`, `_rename`, `_set_limit`, `_remove`) check each rule under the service lock against the store. Author's call: **granular commands**; `board_columns_set` is removed (it has no caller on screen).
- **Lane as a string id vs. an enum with a `Custom(String)` arm:** an enum keeps match exhaustiveness for the built-ins but serialises awkwardly to TS. Author's call: **`Lane` becomes a string id** (`"backlog" | "today" | "doing" | "done" | "c_…"`) with a small `Builtin` helper for the meaning-bearing columns (Doing for Start, Done for `done_at`, Today for the bump back and the reviews).

## Users & permissions
One local user owns their board. No roles.

## Tenancy & localization
n/a (single local user; English copy, as the rest of the app).

## Domain model

### Columns (owner decisions 1, 6, 7)
- The board has **built-in** columns `backlog`, `today`, `doing`, `done`, always present, always in that order, never removable. Their meaning is unchanged (Board Decision 1's semantics stay: Doing = being worked, Done = finished).
- A **custom** column has an id `c_<8 lowercase base-36 characters>` (generated by the service), a name and an optional limit. It sits right after Backlog, Today, Doing or another custom column, never after Done. At most **4** custom columns (8 in total).
- **Names:** 1–24 characters after trimming, for every column. Author's call: names are unique on the board, case-insensitively, so *Move to* lists and VoiceOver names never repeat ("Another column has that name."). Uniqueness is checked on write; a merged row with a duplicate still reads.
- **Limits:** Today 1–9 (default 3), Doing 1–3 (default 1), custom: none or 1–9 (default none). Backlog and Done have none. A limit informs, never blocks (Board Decision 3, Decision 19's words).
- **Storage:** the `board.columns` setting row (JSON) is the ordered list of all columns: `[{ lane, name, limit, order }]`, where `lane` is the column id (the key the row already uses, so no alias is needed) and `order` is 0–7. Synced like other settings, read and written only by the board service. On read:
  - a missing or unreadable row reads as the four defaults;
  - entries are sorted by `order`, with array position breaking ties; then a missing built-in comes back at its default place with its default name and limit, and built-ins are put back in their fixed order;
  - an invalid custom entry is dropped, and custom entries past the fourth are dropped (logged, like `columns.rs:29-33` today);
  - every write stores the cleaned list with `order` matching position.
- **`task.lane`** holds a column id. A live task whose lane is not a column on this board (a custom column removed or lost on another device, then merged in) is an **orphan**. The service **repairs orphans** by moving each to the end of Backlog, logged in `change_log` like any move, at service start and after every data import (`crates/service/src/data/`). The view never shows an orphan in a column it doesn't belong to. A task restored by Undo into a lane that no longer exists goes to the end of Backlog the same way.

## Interfaces

### Store (`crates/store`)
- `migrations/0011_custom_lanes.sql` (0010 is the latest on main, `crates/store/migrations/0010_reflection.sql`; rechecked at landing). SQLite can't alter a CHECK, so it rebuilds `task`:
  - the new table repeats every column and CHECK of `0008_board.sql` plus `origin` with its CHECK from `0009_task_origin.sql`;
  - `lane` CHECK becomes `lane IN ('backlog','today','doing','done') OR (length(lane) = 10 AND lane GLOB 'c_*' AND substr(lane, 3) NOT GLOB '*[^0-9a-z]*')`;
  - every row is copied, then both indexes are recreated: `task_live (deleted_at, lane, rank)` and the partial `task_origin (origin) WHERE origin IS NOT NULL`;
  - there are no triggers or foreign keys on `task` (writes log `change_log` in the repository), so nothing else needs rebuilding; `change_log` rows are untouched.
  - `SCHEMA_VERSION` 11. Fresh-schema table count unchanged.
- `repo/tasks.rs`: the store's `Lane` enum becomes a validated lane string. `move_to` sets `done_at` only for `done`, as now. `origins` orders by lane with `CASE lane` (`tasks.rs:232-234`); custom lanes sort after Doing, before Done. New `count_live_in(lane)` for the remove check and `lanes_live()` (distinct live lanes) for the orphan repair.
- Portability: snapshot, rows and merge carry the lane string unchanged; a v10 export imports; a v11 export into an older app is refused by the existing schema-version check. The settings merge stays whole-row newest-wins (`portability/merge/settings.rs`).

### Service (`crates/service`)
- `api/board.rs`: `Lane` becomes a string newtype (TS `string`). `ColumnView` gains `custom: bool` (true for `c_…`). `ColumnSettings` becomes `{ lane, name, limit, order }`.
- `TaskDraft` keeps `lane: Option<Lane>`; a task added from any column's field is appended at the end of that column, as Backlog's is today (`board/mod.rs:69`) (owner call 11). No position field.
- New commands, each under the service lock, emitting `board-changed` after it (`conventions.md`, newest `seq` wins):
  - `board_column_add(after: Lane, name: Option<String>) -> Lane`: inserts a custom column right after `after` (refused after Done or an unknown lane: `BadColumns`; at 4 custom: `TooManyColumns`). With no name it takes the first free of "New column", "New column 2", "New column 3", "New column 4".
  - `board_column_rename(lane, name)`: any column; `BadColumnName` for empty, over 24 or a duplicate.
  - `board_column_set_limit(lane, limit: Option<u8>)`: Today 1–9, Doing 1–3, custom none or 1–9; `BadLimit` otherwise, for `None` on Today or Doing, and for Backlog and Done.
  - `board_column_remove(lane)`: custom only (`BadColumns` for a built-in); `ColumnNotEmpty` while a live task's lane is `lane`, checked in the same transaction; `ColumnNotFound` for an unknown id.
- `board_columns_set` is removed, with its tests (`board/tests/columns.rs`, `board/tests/settings.rs`), which move to the new commands.
- **Lane checks:** `task_add`, `task_move`, `task_reorder` and the sheet's move refuse a lane that isn't a column: `ColumnNotFound`, "That column is gone. Pick another."
- **Meaning stays with built-ins:** Start moves the task to Doing from any column; the bump past Doing's limit goes to Today; `done_at` is set only by Done. The shutdown's "tomorrow" (`review/tomorrow.rs:55,60`) keeps counting Today only for planned sessions, so a task in a custom column is not planned for tomorrow (author's call); the review's priority lines (`review/view.rs:164`) name the task's column, custom ones included. `session/task_link.rs` refuses Done only, as now.
- **TaskPicker order** (Today and the palette): tasks not Done, closest to Doing first: Doing, then the columns before it in reverse board order, then the custom columns after Doing, ending with Backlog (author's call). `useTaskOptions.ts:6,11` stops filtering to three lanes; the app passes a sort key and the column's name as the hint instead of the fixed `doing | today | backlog` (`packages/ui/src/components/ui/task-picker.tsx:19,39`); `paletteCommands.ts:34` follows.

### Everything that hard-codes the four lanes
Each follows the lane-string change: `lanes.ts:3,9` (`LANES`, `neighbour` read the view's column order), `useFolds.ts:12`, `dragGeometry.ts:42,53`, `dragMeasure.ts`, `useBoardActions.ts:77` (the add lane), `BoardColumns.tsx` (width and density by lane), `useTaskOptions.ts`, `paletteCommands.ts`, `task-picker.tsx`, `store/repo/tasks.rs:232-234`, `review/tomorrow.rs`, `review/view.rs`, `session/task_link.rs`, `board/view.rs`, `board/doing.rs`, `board/columns.rs` and their tests. The plan greps for `'backlog'`, `"today"`, `Lane::` and the TS `Lane` union before it splits tasks.

### IPC (`apps/orasenda/src-tauri`)
Four thin commands in `commands/board.rs`, capability entries, regenerated bindings and permissions; `board_columns_set` and its permission go.

### KanbanColumn (`packages/ui`)
- **Header, two rows** (owner call 1): row one is the heading, wrapping as it does today (`kanban-column.tsx:130`); row two is the count (or chip) at the start and + and ⋯ at the end, each `hit-min`. At `column-min-width` (200px, with `space-3` padding) row two holds the longest count ("4 of 3" chip) and two 44px buttons.
- **+**: `onAdd` adds an `IconButton` (the `plus` glyph) named "Add task to <name>".
- **⋯**: the existing `action` slot holds the column menu: an `IconButton` (the `more` glyph) named "More actions for <name>" (spec A's overflow name) opening a `PopoverMenu` headed with the column's name. `popover-menu.md`'s "in-page action menu on a card or row" exception widens to a column header.
- **Rename in place:** `renaming` (`{ value, error?, onChange, onSave, onCancel }`) replaces row one with an `Input` labelled "Column name" (the heading's type size) and its helper "1 to 24 characters." or the error; row two stays. `maxLength` 24. Enter saves, Esc cancels; both return focus to ⋯.
- **Fold:** the header's Fold icon button goes; *Fold column* lives in the menu (owner call 1). The column keeps `foldedByUs` focus handling: after *Fold column* the board focuses the strip that replaces the column (the menu does not return focus to its unmounted trigger). A folded strip has no menu and opens with a click, Return or Space; to rename a folded column (Done at start), open it first.
- **Disabled rows with a reason:** `PopoverMenu` already gives disabled rows `aria-disabled` (`popover-menu.tsx:110`); it adds the row's `meta` as its description (`aria-describedby`), so VoiceOver says "Remove column, dimmed, Move its tasks out first." Disabled rows stay focusable.
- **Arrow targets for the board:** the column exposes its + and ⋯ to the board's roving (data slots), so the board can step into the header (below).

### ScrollRegion (`packages/ui`)
`axis="x"` (author's call): the region scrolls sideways (`overflow-x: scroll`, `overflow-y: hidden`) with an always-drawn `scrollbar-size` track along the bottom, a `line-strong` thumb at least `hit-floor` long and a clear track, so macOS overlay scrollbars never hide it. No "More below" row, no "More to the right" edge (owner call 7) and no hairline. It is not a tab stop (the content roves). `role="region"` with the host's name. The bar takes `scrollbar-size` (10px) of height even when nothing scrolls, so the gutter never jumps.

### Column menu
| Item | Backlog | Today | Doing | Custom | Done |
|---|---|---|---|---|---|
| Rename column | yes | yes | yes | yes | yes |
| Set limit… | – | yes | yes | yes | – |
| Add column after | yes | yes | yes | yes | – |
| Fold column | yes | yes | yes | yes | yes |
| Remove column | – | – | – | yes (dimmed until empty) | – |

- *Add column after* at the cap is dimmed with "Up to 4 extra columns." Choosing it inserts the new column and opens its rename field with the text selected; Esc keeps the given name (owner call 10).
- *Set limit…* opens a small `Dialog` "Limit for <name>" with a `Stepper` (Today 1–9, Doing 1–3; custom 0–9 with `zeroLabel` "No limit", where 0 is sent as no limit), *Save* (primary) and *Cancel* (owner call 2). Esc cancels; focus returns to ⋯.
- *Remove column* removes at once and shows a toast "Removed <name>." with no Undo (owner call 5). Focus moves to the ⋯ of the column before it.

### Board page (`features/board/`)
- **Sideways scroll (owner decision 3):** in a regular window the row of columns sits in a `ScrollRegion axis="x"` named "Board columns".
- **Widths:** open columns stay fluid between `column-min-width` and their widest (`column-width`; Today and Doing `column-wide-width`), as today. The row scrolls only once every open column is at `column-min-width` and they still don't fit (owner call 13). Custom columns are standard width with `density="card"`.
- **Folding is manual only (owner decision 3):** `capacity` (`useFolds.ts`), `useRoom` and the fold-for-room order go. Done starts folded; every other column, custom ones included, starts open, and a column added later starts open. Fold state lives for the page's life, as now. Opening a strip moves focus to its first card or, when empty, its ⋯.
- **Keyboard (roving, one tab stop as now):**
  - ←/→ move to the same row in the next column or strip, custom ones and empty columns included (today's `stepColumn` skips empty and folded columns, `useBoardKeys.ts:75-82`). In a column with no cards, focus lands on its ⋯; on a strip, on the strip.
  - ↑ from a column's first card goes to its ⋯; in the header, ←/→ move between + and ⋯ and on to the next column's header controls; ↓ from the header goes to the first card. ↑/↓ between cards, Home/End, ⌥⌘arrows, ⌘⌫, F and Return are unchanged (Board spec, Board page).
  - No new tab stops and no new shortcut: the header controls are reached by arrows (owner call 14).
  - When focus lands in a column outside the region's view, the column scrolls into view with `scrollIntoView({ inline: "nearest", behavior })`, `behavior` "smooth" normally and "auto" under reduce-motion.
  - ⌥⌘←/→ moves a card into the next column in board order, custom and folded ones included.
- **Header +:** opens a `NewTaskField` at the top of that column; Enter adds the task at the end of that column (owner call 11) and keeps the field ready; Esc, or leaving it empty, closes it and returns focus to +. Only one such field is open at a time; opening another closes the first. Backlog keeps its always-there field, and its + focuses it. Each field has its own id and the label "New task in <name>". No + on Done (owner call 8).
- **Page *Add task* (⌘N):** unchanged, focuses Backlog's field.
- **Drag:** a card dragged within `column-strip-width` of the region's left or right edge scrolls the region at a steady pace (user-driven, so it runs under reduce-motion too). A folded Done strip at the right edge is still a drop target; the edge zone scrolls only while there is more to scroll. `dragMeasure.ts` finds the board's own regions by role: the horizontal region's `scrollLeft` in a regular window, the vertical region's `scrollTop` in a compact one. The drop index skips a leading new-task field in any column.
- **Limits:** custom columns use the same words as Today and Doing: "2 of 3", "At limit", "4 of 3" in the `warning` chip, never red. A custom column without a limit reads "N tasks".
- **Empty states:** an empty custom column uses the default "Nothing here yet. That's fine." The empty board's `EmptyState` is unchanged (columns appear once there is a task).
- **Rename errors are inline only:** the field checks length and uniqueness against the current view as the person types and shows the error as its helper. Enter on an invalid name keeps the field open; a service refusal (a rename that raced another window) keeps the field open with the service's words. Blur saves a valid name and cancels an invalid one (owner call 3).
- **Other errors:** a refused or failed column write (add, limit, remove) shows a toast in the service's words ("Up to 4 extra columns.", "Move its tasks out first.", "That column is gone. Pick another.", "That didn't save. Try again.") and the board keeps the last good view.

## Behavior & edge cases
- **Two windows or two devices:** the newest `board-changed` wins. A column removed elsewhere while its rename field is open: the field closes and a toast says "That column is gone. Pick another." Columns added on two devices before a merge: the newer row wins, the other device's column goes, and its tasks are repaired to the end of Backlog (owner call 12).
- **Removal race:** the service checks emptiness in the same transaction as the removal, so a task added a moment before is never orphaned.
- **The running task** can sit in any column; nothing about the link changes (Board spec, Behavior).
- **Rename to the same name** saves nothing and closes the field.
- **Done's name** can change ("Finished"); its meaning, the 14-day window and the folded start stay.
- **Compact window:** the stacked board lists every column in order with the same header controls; the vertical `ScrollRegion` is unchanged.

## Data & migrations
- `0011_custom_lanes.sql`: table rebuild for the relaxed lane CHECK (Interfaces, Store). Every row kept; nothing back-filled. The setting row's old shape `[{ lane, name, limit }]` (four entries, no `order`) reads by array position; it is rewritten with `order` on the next column write.
- Exports: unchanged format; custom lanes travel as strings.

## Testing strategy
- **Store:** migration 10→11 on a filled database (rows, ranks, `origin` and `change_log` kept; `task_live` and `task_origin` exist after; a custom lane accepted; a malformed lane and a bad `origin` refused by their CHECKs); `count_live_in`; `lanes_live`; `origins` ordering with a custom lane; portability round trip with a custom lane.
- **Service:** each new command and each refusal (`TooManyColumns`, `ColumnNotEmpty`, `BadColumns` for a built-in, after Done or an unknown `after`, `BadColumnName` duplicate, `BadLimit`, `ColumnNotFound`); "New column" numbering; the old setting shape reads; a missing built-in comes back; more than 4 custom entries trim to 4; orphan repair at start and after an import; restore into a removed lane goes to Backlog; Start from a custom column moves to Doing; tomorrow ignores custom columns; the TaskPicker order; events after the lock.
- **Components:** KanbanColumn header rows at 200px with the "4 of 3" chip, + and ⋯ names, rename field keys (Enter, Esc, blur), helper and error text, both themes through the specimen; PopoverMenu disabled row with its reason as description; ScrollRegion `axis="x"` bar, gutter and no edge row; `just contrast` for any new pair.
- **App (vitest):** column menu items per column kind; rename (inline errors, duplicate); Set limit including "No limit"; Add column after and the cap; Remove dimmed and enabled, focus after; header + adds to its column, one field at a time; ←/→ into an empty custom column and a strip; ↑ into the header; scroll-into-view called with the reduce-motion behaviour; ⌥⌘arrows through a custom column; no fold for room; Done folded at start; drag into a custom column with the region scrolled.
- **Review checklist** (each UI PR ticks what it renders): one primary action; state in words and shape; no red; kind copy without exclamation marks; tokens only; both themes; focus ring; hit-min; VoiceOver names; reduce-motion.
- **Owner's visual checklist** (no screenshots in PRs): the Board at 1440 × 900, 900 × 600 and 640 × 480, light and dark.

## Size
This is about six PRs: store and migration; service and IPC; `PopoverMenu` and `ScrollRegion`; `KanbanColumn` header; Board page; docs and close-out. `popover-menu.tsx` (363 lines) and its test (453 lines) are near the 500-line ceiling (`conventions.md`), so the plan splits them before adding to them.

## Decisions
Owner decisions, approved 2026-11-18:
1. **A custom column is a plain stage:** a name, plus an optional limit that informs but never blocks, like Today's. The four built-ins (Backlog, Today, Doing, Done) stay fixed in order, keep their meaning and can't be removed. Custom columns sit between them.
2. **A custom column can be removed only when it's empty.** Until then *Remove column* is disabled, with the reason as helper text.
3. **The board scrolls sideways and nothing folds by itself.** Done still starts folded, and any column can still be folded by hand. Supersedes Board Decisions 1 (fixed four) and 18 ("never scrolls sideways", auto-fold), and closes #584.
4. **Rename comes from the column's ⋯ menu** ("Rename column"). It turns the heading into a text field in place: Enter saves, Esc cancels, 1–24 characters.
5. **The header's + opens the new-task field at the top of that column.** The ⋯ menu holds Rename column, Set limit (Today, Doing and custom columns), Add column after, Fold column, and Remove column (custom columns only, disabled until empty). The page's *+ Add task* stays and still adds to Backlog.
6. **Storage:** the `board.columns` setting (JSON) becomes the ordered list of all columns: the built-ins plus custom ones with a generated id `c_<random>`, a name, an optional limit and an order. A new migration relaxes `task.lane`'s CHECK so a task can hold a custom id. The service validates that a lane exists. No new table.
7. **At most 4 custom columns (8 in total).** At the cap, *Add column after* is disabled with "Up to 4 extra columns."

Author's calls (opus, 2026-11-18), each marked where it appears: granular column commands replacing `board_columns_set`; `Lane` as a string id; the id format `c_` + 8 base-36 characters; the read rules for the setting row; orphan repair to the end of Backlog; custom columns ignored by tomorrow and the review; the TaskPicker order; `ScrollRegion` `axis="x"`; drag edge-scroll; arrow navigation into headers.

The design-system README's "Board never scrolls sideways" rule, `kanban-column.md`'s fold rules and `popover-menu.md`'s menu rule are rewritten by the component tasks (living docs), not here.

## FAQ
### Why not let a custom column behave like Doing or Done?
Behaviour tied to a column is what Board Decision 1 protected. Keeping custom columns plain means Start, the Doing limit, the bump and Done's window keep one meaning each.

### Why scroll instead of folding for room?
Folding hid work the person didn't ask to hide, and with up to 8 columns it would fold most of them at 900 × 600. A sideways scroll keeps every column where the person put it.

### Why repair orphans instead of showing them in Backlog?
Showing them in Backlog while their stored lane says otherwise leaves ranks, reorders and counts with two readings. Moving them for real, once, keeps one rule: a task is in the column its lane names.

### Why no Undo on Remove column?
The column is empty when it goes, so nothing is lost; making it again is one menu item (owner call 5).

## Owner calls to confirm
These are author's calls that change what the owner sees. Each is built as written unless the owner overrules it at approval.
1. **Two-row header:** the name on its own row, then the count with + and ⋯. The header's Fold icon button goes; *Fold column* lives in the ⋯ menu.
2. **Set limit…** opens a small dialog with a Stepper and Save/Cancel (custom columns can choose "No limit").
3. In the rename field, **blur saves** a valid name and cancels an invalid one.
4. **Folds aren't saved:** leaving the Board and coming back opens every column but Done again.
5. **Remove column has no Undo:** the column is empty; a toast says "Removed <name>."
6. **No column reordering:** a custom column stays where it was added. #584's "reorder" part becomes a follow-up issue.
7. **No "More to the right" edge:** the always-drawn scrollbar and the next column's visible edge say there's more.
8. **No + on Done:** a task isn't born finished. Done's header holds the count and ⋯ only.
9. **Names are unique** on the board (case-insensitive): "Another column has that name."
10. *Add column after* names the new column "New column" (then "New column 2", …) and opens its rename field at once.
11. **A task added from a column's + goes to the end of that column**, like Backlog's field today; the field stays at the top.
12. **Column edits on two devices aren't merged:** the newer list wins, and tasks in a column that disappears move to the end of Backlog.
13. **Columns squeeze to `column-min-width` (200px) before the board scrolls.** At 900 × 600 the four built-ins look as today; the row scrolls once custom columns no longer fit.
14. **Header controls are reached by arrows, not Tab:** ↑ from a column's first card reaches its ⋯; an empty column's arrow target is its ⋯. No new shortcut.
15. **Tasks in custom columns aren't planned for tomorrow** in the shutdown (only Today's are); the weekly review names their column like any other.

## Open questions
None beyond the owner calls above.

## Implementation status
Updated by the PRs that implement this spec (plan and issues to follow).
- [ ] Store: migration 0011 and lane strings
- [ ] Service and IPC: column commands, lane checks and orphan repair
- [ ] PopoverMenu disabled reasons; ScrollRegion `axis="x"`
- [ ] KanbanColumn header: two rows, +, ⋯, rename field
- [ ] Board page: sideways scroll, column menu, add, rename, limit, remove, manual fold, keyboard
- [ ] Docs: design-system README and close-out
