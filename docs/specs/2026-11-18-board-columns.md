# Board columns: rename, custom columns, sideways scroll and the column editor — Spec

- **Status:** implemented (2026-11-19)
- **Date:** 2026-11-18
- **Owner:** the product owner (decisions approved 2026-11-18; owner calls answered the same day)
- **Related:** [Board](2026-11-14-board.md) (Decisions 1 and 18 are superseded here; closes #584); [Board polish](2026-11-15-board-polish.md); [UI consistency](2026-11-17-ui-consistency.md)
- **Plan:** to be written (`docs/plans/2026-11-18-board-columns.md`)

## TL;DR
- Each column header holds the **name**, the **count**, a **+** (a new-task field at the top of that column) and the **fold** icon in the top-right corner, as today. There is no ⋯ menu.
- **Double-click the name** (or press Return on it) to open the **column editor** in place: the name field, the limit, *Add column after* and *Remove column*. Enter saves, Esc cancels, names are 1–24 characters.
- **Up to 4 custom columns** sit between the four built-ins (Backlog, Today, Doing, Done), which stay fixed in order and meaning. A custom column is a plain stage: a name and an optional limit that informs, never blocks. It can be removed only when empty.
- **The board scrolls sideways** and never folds by itself. Done starts folded; any column folds by hand, and folds are saved.
- **Storage:** the `board.columns` setting becomes the ordered list of all columns; migration 0011 relaxes `task.lane`'s CHECK so a task can sit in a custom column. No new table.

## Change in a nutshell
Board at 900 × 600 with two custom columns (Waiting after Today, Review after Doing). Each open column is at `column-min-width`, so the row scrolls; at 1440 × 900 the same six fit without scrolling:

```
 Board                                                               [ + Add task ]
 ┌ Backlog     [⌃] ┐ ┌ Today       [⌃] ┐ ┌ Waiting     [⌃] ┐ ┌ Doing      [⌃]
 │ 6 tasks     [+] │ │ 2 of 3      [+] │ │ 1 task      [+] │ │ At limit   [+]
 │ [New task…    ] │ │ ◆ Write intro   │ │ ○ Reply from Ana│ │ ◆ Fix sync bug
 │ ○ Book dentist  │ │ ○ Draft outline │ │                 │ │
 └─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────────
 ═════════════════▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬════════════════════════════════
                          (always-drawn sideways scrollbar)
```

Double-click "Waiting" (or Return on it) and the header becomes the column editor:

```
 ┌ [Waiting on others|      ] ┐
 │ 1 to 24 characters.        │
 │ Limit   [-] No limit [+]   │
 │ [ Add column after ]       │
 │ [ Remove column ]  dimmed  │
 │ Move its tasks out first.  │
 │ [ Save ]  [ Cancel ]       │
 └────────────────────────────┘
```

At the cap, *Add column after* is dimmed with "Up to 4 extra columns." In general: every open column has the same header; the editor shows only what applies to that column (see [Column editor](#column-editor)).

## Problem
The Board's four columns are fixed (Board Decision 1), their names can't be changed on screen although the service supports it (`board_columns_set` has no caller: `apps/orasenda/src/features/board/useBoard.ts:113-117`), and their limits can't be set either. People who work with a waiting or review stage have nowhere to put it. The board also folds columns by itself when the window narrows (`useFolds.ts`, `useRoom.ts`), which hides work without the person asking, and forgets the person's own folds when they leave the page.

## Goals / Success criteria
1. From a column's editor the person can rename any open column, set the limit of Today, Doing and any custom column, add a custom column after any column but Done, and remove an empty custom column. Every column, folded or open, can be folded or opened from its header.
2. A custom column can hold, receive and give up tasks exactly like Backlog or Today: add, drag, ⌥⌘←/→, the card's *Move to* menu, the task sheet's column choice.
3. At 4 custom columns, *Add column after* is disabled and says "Up to 4 extra columns."; the service refuses a fifth.
4. *Remove column* is disabled with "Move its tasks out first." while the column holds a task; the service refuses removing a non-empty or built-in column.
5. At any regular window size, no column folds unless the person folds it; when the open columns don't fit at `column-min-width`, the board scrolls sideways with an always-drawn scrollbar. Done starts folded. Folds are saved and come back after leaving the Board or relaunching.
6. Keyboard: arrows reach every column, strip and header control, empty columns included, and the focused column is scrolled into view. Return on a column's name opens its editor.
7. The header's + opens a new-task field at the top of that column; the page's *Add task* still adds to Backlog.
8. A database at schema 10 migrates to 11 with every task, index and CHECK kept; exports and merge carry custom lanes.

## Non-goals
- A ⋯ menu on the column header (owner, 2026-11-18: "if something comes up later we can migrate to a dotted menu").
- Reordering columns, or moving a custom column after it is made. #584's "reorder" part becomes a follow-up issue: #797.
- Removing, reordering or renaming the meaning of a built-in column.
- A column with its own behaviour (auto-move, timers, Done-like semantics). A custom column is a plain stage.
- **The shutdown.** `review/tomorrow.rs` is not touched; how custom columns count toward tomorrow is a later spec (owner, 2026-11-18).
- Merging two devices' column edits field by field (the newer list wins; see Behavior).
- The compact (stacked) board's layout: it stays a vertical stack in a `ScrollRegion`; custom columns appear in it in board order.
- Pointer drag of columns.

## Approaches
The owner chose the shape on 2026-11-18 (the decisions below). The build approach is the author's call:
- **Granular column commands vs. one `board_columns_set`:** `board_columns_set` takes the whole list, so "remove only when empty", "at most 4" and id generation would be checked against a list the client built from a possibly stale view. Granular commands check each rule under the service lock against the store. Author's call: **granular commands**; `board_columns_set` is removed (it has no caller on screen).
- **Lane as a string id vs. an enum with a `Custom(String)` arm:** an enum keeps match exhaustiveness for the built-ins but serialises awkwardly to TS. Author's call: **`Lane` becomes a string id** (`"backlog" | "today" | "doing" | "done" | "c_…"`) with a small `Builtin` helper for the meaning-bearing columns (Doing for Start, Done for `done_at`, Today for the bump back).
- **Where the column actions live** (owner, 2026-11-18): a ⋯ menu, actions spread across the board, a right-click menu, or one editor opened by double-click. Picked: **the editor**, because nothing extra shows at rest and every column setting is in one place.

## Users & permissions
One local user owns their board. No roles.

## Tenancy & localization
n/a (single local user; English copy, as the rest of the app).

## Domain model

### Columns (owner decisions 1, 6, 7)
- The board has **built-in** columns `backlog`, `today`, `doing`, `done`, always present, always in that order, never removable. Their meaning is unchanged (Board Decision 1's semantics stay: Doing = being worked, Done = finished).
- A **custom** column has an id `c_<8 lowercase base-36 characters>` (generated by the service), a name and an optional limit. It sits right after Backlog, Today, Doing or another custom column, never after Done. At most **4** custom columns (8 in total).
- **Names:** 1–24 characters after trimming, for every column, unique on the board case-insensitively ("Another column has that name."), so *Move to* lists and VoiceOver names never repeat (owner decision 9). Uniqueness is checked on write; a merged row with a duplicate still reads.
- **Limits:** Today 1–9 (default 3), Doing 1–3 (default 1), custom: none or 1–9 (default none). Backlog and Done have none. A limit informs, never blocks (Board Decision 3, Decision 19's words).
- **Folded:** each column has a `folded` flag (default: Done folded, the rest open), saved in the same row, so the person's folds come back after leaving the Board or relaunching, and follow the row when it syncs (owner decision 11).
- **Storage:** the `board.columns` setting row (JSON) is the ordered list of all columns: `[{ lane, name, limit, order, folded }]`, where `lane` is the column id (the key the row already uses, so no alias is needed) and `order` is 0–7. Synced like other settings, read and written only by the board service. On read:
  - a missing or unreadable row reads as the four defaults;
  - entries are sorted by `order`, with array position breaking ties; then a missing built-in comes back at its default place with its default name, limit and fold, and built-ins are put back in their fixed order;
  - an invalid custom entry is dropped, and custom entries past the fourth are dropped (logged, like `columns.rs:29-33` today); a missing `folded` reads as the default;
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
- `api/board.rs`: `Lane` becomes a string newtype (TS `string`). `ColumnView` gains `custom: bool` (true for `c_…`) and `folded: bool`. `ColumnSettings` becomes `{ lane, name, limit, order, folded }`.
- `TaskDraft` keeps `lane: Option<Lane>`; a task added from any column's field is appended at the end of that column, as Backlog's is today (`board/mod.rs:69`) (owner decision 11). No position field.
- New commands, each under the service lock, emitting `board-changed` after it (`conventions.md`, newest `seq` wins):
  - `board_column_edit(lane, name, limit: Option<u8>)`: saves the editor in one write. Any column's name (`BadColumnName` for empty, over 24 or a duplicate); the limit for Today 1–9, Doing 1–3, custom none or 1–9 (`BadLimit` otherwise, for `None` on Today or Doing, and for anything but `None` on Backlog and Done). Nothing changes if either is refused.
  - `board_column_add(after: Lane) -> Lane`: inserts a custom column right after `after`, open, with no limit, named the first free of "New column", "New column 2", "New column 3", "New column 4" (refused after Done or an unknown lane: `BadColumns`; at 4 custom: `TooManyColumns`).
  - `board_column_remove(lane)`: custom only (`BadColumns` for a built-in); `ColumnNotEmpty` while a live task's lane is `lane`, checked in the same transaction; `ColumnNotFound` for an unknown id.
  - `board_column_fold(lane, folded: bool)`: saves a fold; `ColumnNotFound` for an unknown id.
- `board_columns_set` is removed, with its tests (`board/tests/columns.rs`, `board/tests/settings.rs`), which move to the new commands.
- **Lane checks:** `task_add`, `task_move`, `task_reorder` and the sheet's move refuse a lane that isn't a column: `ColumnNotFound`, "That column is gone. Pick another."
- **Meaning stays with built-ins:** Start moves the task to Doing from any column; the bump past Doing's limit goes to Today; `done_at` is set only by Done. `session/task_link.rs` refuses Done only, as now. The weekly review's priority lines (`review/view.rs:164`) name the task's column, custom ones included. The shutdown (`review/tomorrow.rs`) is not touched (Non-goals).
- **TaskPicker order** (Today and the palette): tasks not Done, closest to Doing first: Doing, then the columns before it in reverse board order, then the custom columns after Doing, ending with Backlog (author's call). `useTaskOptions.ts:6,11` stops filtering to three lanes; the app passes a sort key and the column's name as the hint instead of the fixed `doing | today | backlog` (`packages/ui/src/components/ui/task-picker.tsx:19,39`); `paletteCommands.ts:34` follows.

### Everything that hard-codes the four lanes
Each follows the lane-string change: `lanes.ts:3,9` (`LANES`, `neighbour` read the view's column order), `useFolds.ts`, `dragGeometry.ts:42,53`, `dragMeasure.ts`, `useBoardActions.ts:77` (the add lane), `BoardColumns.tsx` (width and density by lane), `useTaskOptions.ts`, `paletteCommands.ts`, `task-picker.tsx`, `store/repo/tasks.rs:232-234`, `review/view.rs`, `session/task_link.rs`, `board/view.rs`, `board/doing.rs`, `board/columns.rs` and their tests. `review/tomorrow.rs` keeps compiling against the new `Lane` with its behaviour unchanged. The plan greps for `'backlog'`, `"today"`, `Lane::` and the TS `Lane` union before it splits tasks.

### IPC (`apps/orasenda/src-tauri`)
Four thin commands in `commands/board.rs`, capability entries, regenerated bindings and permissions; `board_columns_set` and its permission go.

### KanbanColumn (`packages/ui`)
- **Header, two rows:** row one is the name, wrapping as it does today (`kanban-column.tsx:130`), with the existing Fold icon button (`kanban-column.tsx:141`) in the top-right corner; row two is the count (or chip) at the start and + at the end. Each button is `hit-min`. At `column-min-width` (200px, `space-3` padding) row two holds the longest count ("4 of 3" chip) and the 44px +.
- **+**: `onAdd` adds an `IconButton` (the `plus` glyph) named "Add task to <name>".
- **The name opens the editor:** with `onEdit`, the name is a quiet text button inside the `h2` (it reads as the heading, no button chrome at rest; hover shows an inset 1px line-strong edge, and the focus ring shows on focus). A **double-click** calls `onEdit`; a single pointer click does nothing, so a stray click never opens the editor. **Return or Space** from the keyboard, and VoiceOver's activate, call `onEdit` (a click with `detail === 0`). Its name is the column's name, with the description "Double-click or press Return to edit the column."
- **`editor` slot:** while set, it replaces both header rows (the Fold button included); the cards stay below.
- **Fold:** unchanged: `collapsed` and `onToggle`, the Fold icon in the open header and the strip, `foldedByUs` focus handling (`kanban-column.tsx:64-68`). A folded strip opens with a click, Return or Space; to edit a folded column (Done at start), open it first.
- **Arrow targets for the board:** the column marks its name button, + and Fold with data slots, so the board's roving can step into the header (below).

### ColumnEditor (`packages/ui`, new)
- **Anatomy, top to bottom:** an `Input` labelled "Column name" (at body size, not heading size, `maxLength` 24) with its helper "1 to 24 characters." or the error; a `Stepper` "Limit" (only when a limit applies); *Add column after* (`Button`, quiet) with its helper when dimmed; *Remove column* (`Button`, quiet; custom columns only) with its helper when dimmed; *Save* (primary within the editor) and *Cancel* (quiet). Gaps are `space-2`; it fills the column's width on `surface-sunken`, like the header it replaces.
- **Props:** `name`, `limit` (`{ value, min, max, zeroLabel? } | null`), `error?`, `canAdd: true | { reason } | null` (null hides it), `canRemove: true | { reason } | null` (null hides it), `onSave({ name, limit })`, `onCancel()`, `onAdd(pending: { name, limit } | null)`, `onRemove()`.
- **Keys:** the name field is focused with its text selected on open. Enter (in the name field or the stepper) saves; Esc anywhere in the editor cancels. Tab moves through the field, stepper and buttons in order. Focus leaving the editor saves a valid edit and cancels an invalid one (owner decision 3).
- **Dimmed buttons** use `aria-disabled` (not `disabled`), stay focusable, and carry their helper as `aria-describedby`, so VoiceOver says "Remove column, dimmed, Move its tasks out first." Their helper shows under them in `caption` `ink-muted`.
- **One primary per screen:** the editor's *Save* is `variant="primary"` only while the editor is open, and the page's *Add task* is quiet then (author's call), so there is still one primary action on screen.

### Column editor
What the editor shows per column:

| Control | Backlog | Today | Doing | Custom | Done |
|---|---|---|---|---|---|
| Name | yes | yes | yes | yes | yes |
| Limit | – | 1–9 | 1–3 | 0–9, 0 reads "No limit" | – |
| Add column after | yes | yes | yes | yes | – |
| Remove column | – | – | – | yes, dimmed until empty | – |

- **Save:** one `board_column_edit` for the name and the limit; the editor closes and focus returns to the name. A refusal (a race with another window) keeps the editor open with the service's words as the name's error. The field checks length and uniqueness against the current view as the person types, so most errors never reach the service.
- **Cancel / Esc:** nothing is written; focus returns to the name.
- **Add column after:** saves a valid pending edit first (an invalid one is dropped), then adds the column. The new column opens its own editor with "New column" selected; Esc there keeps "New column" (owner decision 10). At the cap it is dimmed with "Up to 4 extra columns."
- **Remove column:** removes at once and shows a toast "Removed <name>." with no Undo (owner decision 5). Focus moves to the name of the column before it. While the column holds a task it is dimmed with "Move its tasks out first."
- One editor is open at a time; opening another column's editor saves or cancels the first by the focus-leaving rule.

### ScrollRegion (`packages/ui`)
`axis="x"` (author's call): the region scrolls sideways (`overflow-x: scroll`, `overflow-y: hidden`) with an always-drawn `scrollbar-size` track along the bottom, a `line-strong` thumb at least `hit-floor` long and a clear track, so macOS overlay scrollbars never hide it. No "More below" row, no "More to the right" edge (owner decision 7) and no hairline. It is not a tab stop (the content roves). `role="region"` with the host's name. The bar takes `scrollbar-size` (10px) of height even when nothing scrolls, so the gutter never jumps.

### Board page (`features/board/`)
- **Sideways scroll (owner decision 3):** in a regular window the row of columns sits in a `ScrollRegion axis="x"` named "Board columns".
- **Widths:** open columns stay fluid between `column-min-width` and their widest (`column-width`; Today and Doing `column-wide-width`), as today. The row scrolls only once every open column is at `column-min-width` and they still don't fit (owner decision 13). Custom columns are standard width with `density="card"`.
- **Folding is manual only (owner decision 3):** `capacity` (`useFolds.ts`), `useRoom` and the fold-for-room order go. Folds come from `ColumnView.folded` and are saved with `board_column_fold`; the board shows the fold at once and keeps it if the write fails (with the "That didn't save. Try again." toast). A column added later starts open. Opening a strip moves focus to its first card or, when empty, its name.
- **Keyboard (roving, one tab stop as now):**
  - ←/→ move to the same row in the next column or strip, custom ones and empty columns included (today's `stepColumn` skips empty and folded columns, `useBoardKeys.ts:75-82`). In a column with no cards, focus lands on its name; on a strip, on the strip.
  - ↑ from a column's first card goes to its name; in the header, ←/→ move between the name, Fold and + and on to the next column's header; ↓ from the header goes to the first card. Return on the name opens the editor. ↑/↓ between cards, Home/End, ⌥⌘arrows, ⌘⌫, F and Return on a card are unchanged (Board spec, Board page).
  - No new tab stops and no new shortcut (owner decision 14).
  - When focus lands in a column outside the region's view, the column scrolls into view with `scrollIntoView({ inline: "nearest", behavior })`, `behavior` "smooth" normally and "auto" under reduce-motion.
  - ⌥⌘←/→ moves a card into the next column in board order, custom and folded ones included.
  - While an editor is open, the board's page keys (arrows, F, ⌘⌫) do nothing inside it.
- **Header +:** opens a `NewTaskField` at the top of that column; Enter adds the task at the end of that column (owner decision 11) and keeps the field ready; Esc, or leaving it empty, closes it and returns focus to +. Only one such field is open at a time; opening another closes the first. Backlog keeps its always-there field, and its + focuses it. Each field has its own id and the label "New task in <name>". No + on Done (owner decision 8).
- **Page *Add task* (⌘N):** unchanged, focuses Backlog's field.
- **Drag:** a card dragged within `column-strip-width` of the region's left or right edge scrolls the region at a steady pace (user-driven, so it runs under reduce-motion too). A folded Done strip at the right edge is still a drop target; the edge zone scrolls only while there is more to scroll. `dragMeasure.ts` finds the board's own regions by role: the horizontal region's `scrollLeft` in a regular window, the vertical region's `scrollTop` in a compact one. The drop index skips a leading new-task field in any column.
- **Limits:** custom columns use the same words as Today and Doing: "2 of 3", "At limit", "4 of 3" in the `warning` chip, never red. A custom column without a limit reads "N tasks".
- **Empty states:** an empty custom column uses the default "Nothing here yet. That's fine." The empty board's `EmptyState` is unchanged (columns appear once there is a task).
- **Errors:** a refused or failed add, remove or fold shows a toast in the service's words ("Up to 4 extra columns.", "Move its tasks out first.", "That column is gone. Pick another.", "That didn't save. Try again.") and the board keeps the last good view. Editor save errors are inline (Column editor).

## Behavior & edge cases
- **Two windows or two devices:** the newest `board-changed` wins. A column removed elsewhere while its editor is open: the editor closes and a toast says "That column is gone. Pick another." Columns added on two devices before a merge: the newer row wins, the other device's column goes, and its tasks are repaired to the end of Backlog (owner decision 12). Folds follow the same row.
- **Removal race:** the service checks emptiness in the same transaction as the removal, so a task added a moment before is never orphaned.
- **The running task** can sit in any column; nothing about the link changes (Board spec, Behavior).
- **Saving an unchanged editor** writes nothing and closes it.
- **Done's name** can change ("Finished"); its meaning and the 14-day window stay.
- **Compact window:** the stacked board lists every column in order with the same header and editor; the vertical `ScrollRegion` is unchanged.

## Data & migrations
- `0011_custom_lanes.sql`: table rebuild for the relaxed lane CHECK (Interfaces, Store). Every row kept; nothing back-filled. The setting row's old shape `[{ lane, name, limit }]` (four entries, no `order` or `folded`) reads by array position with default folds; it is rewritten in the new shape on the next column write.
- Exports: unchanged format; custom lanes travel as strings.

## Testing strategy
- **Store:** migration 10→11 on a filled database (rows, ranks, `origin` and `change_log` kept; `task_live` and `task_origin` exist after; a custom lane accepted; a malformed lane and a bad `origin` refused by their CHECKs); `count_live_in`; `lanes_live`; `origins` ordering with a custom lane; portability round trip with a custom lane.
- **Service:** each new command and each refusal (`TooManyColumns`, `ColumnNotEmpty`, `BadColumns` for a built-in, after Done or an unknown `after`, `BadColumnName` duplicate, `BadLimit` per column kind, `ColumnNotFound`); an edit refused on its limit leaves the name unchanged; "New column" numbering; folds saved and read; the old setting shape reads; a missing built-in comes back; more than 4 custom entries trim to 4; orphan repair at start and after an import; restore into a removed lane goes to Backlog; Start from a custom column moves to Doing; the TaskPicker order; events after the lock.
- **Components:** KanbanColumn header rows at 200px with the "4 of 3" chip, Fold top-right, + name; the name button opens on double-click and on Return or Space, not on a single click; the editor slot replaces the header; ColumnEditor per column kind, keys (Enter, Esc, focus leaving), helpers and dimmed buttons' descriptions, both themes through the specimen; ScrollRegion `axis="x"` bar, gutter and no edge row; `just contrast` for any new pair.
- **App (vitest):** the editor per column kind; rename with inline errors and duplicates; limit including "No limit"; Add column after and the cap; Remove dimmed and enabled, focus after; header + adds to its column, one field at a time; ←/→ into an empty custom column and a strip; ↑ into the header and Return opening the editor; scroll-into-view with the reduce-motion behaviour; ⌥⌘arrows through a custom column; no fold for room; Done folded at start; folds kept after the page remounts; drag into a custom column with the region scrolled.
- **Review checklist** (each UI PR ticks what it renders): one primary action; state in words and shape; no red; kind copy without exclamation marks; tokens only; both themes; focus ring; hit-min; VoiceOver names; reduce-motion.
- **Owner's visual checklist** (no screenshots in PRs): the Board at 1440 × 900, 900 × 600 and 640 × 480, light and dark.

## Size
About six PRs: store and migration; service and IPC; `ScrollRegion` `axis="x"`; `KanbanColumn` header and `ColumnEditor`; the Board page; docs and close-out.

## Decisions
Owner decisions, approved 2026-11-18 (1–7 before the spec; 8–15 at the spec review, where the owner answered the author's calls):
1. **A custom column is a plain stage:** a name, plus an optional limit that informs but never blocks, like Today's. The four built-ins (Backlog, Today, Doing, Done) stay fixed in order, keep their meaning and can't be removed. Custom columns sit between them.
2. **A custom column can be removed only when it's empty.** Until then *Remove column* is disabled, with the reason as helper text.
3. **The board scrolls sideways and nothing folds by itself.** Done still starts folded, and any column can still be folded by hand. Supersedes Board Decisions 1 (fixed four) and 18 ("never scrolls sideways", auto-fold), and closes #584.
4. **Rename in place:** the heading turns into a text field: Enter saves, Esc cancels, 1–24 characters. Revised at the spec review: it opens with a **double-click on the name** (or Return), not from a ⋯ menu; focus leaving saves a valid name and cancels an invalid one.
5. **The header's + opens the new-task field at the top of that column.** The page's *+ Add task* stays and still adds to Backlog. Revised at the spec review: **no ⋯ menu**; the Fold icon stays in the header's top-right corner, and Set limit, Add column after and Remove column (custom columns only, disabled until empty) live in the column editor ("I appreciate more simplicity; if something comes up later we can migrate to a dotted menu").
6. **Storage:** the `board.columns` setting (JSON) becomes the ordered list of all columns: the built-ins plus custom ones with a generated id `c_<random>`, a name, an optional limit and an order. A new migration relaxes `task.lane`'s CHECK so a task can hold a custom id. The service validates that a lane exists. No new table.
7. **At most 4 custom columns (8 in total).** At the cap, *Add column after* is disabled with "Up to 4 extra columns."
8. **No + on Done;** removing an empty column has no Undo, only the toast "Removed <name>."; no column reordering; no "More to the right" edge.
9. **Column names are unique** on the board, case-insensitively.
10. **A new column is "New column"** (then "New column 2", …) and opens its editor at once.
11. **Folds are saved** (per column, in the setting row). **A task added from a column's + goes to the end of that column.**
12. **Column edits on two devices aren't merged:** the newer list wins, and tasks in a column that disappears move to the end of Backlog.
13. **Columns squeeze to `column-min-width` before the board scrolls.**
14. **Header controls are reached by arrows, not Tab;** no new shortcut.
15. **The shutdown is not touched** in this spec.

Author's calls (opus, 2026-11-18), each marked where it appears: granular column commands replacing `board_columns_set`, with one `board_column_edit` for the editor; `Lane` as a string id; the id format `c_` + 8 base-36 characters; the read rules for the setting row; folds stored in the setting row (so they sync); orphan repair to the end of Backlog; the TaskPicker order; `ScrollRegion` `axis="x"`; drag edge-scroll; a single click on the name does nothing; *Add task* quiet while an editor is open; `ColumnEditor` as a new component.

The design-system README's "Board never scrolls sideways" rule and `kanban-column.md`'s fold rules are rewritten by the component tasks (living docs), not here.

## FAQ
### Why not let a custom column behave like Doing or Done?
Behaviour tied to a column is what Board Decision 1 protected. Keeping custom columns plain means Start, the Doing limit, the bump and Done's window keep one meaning each.

### Why scroll instead of folding for room?
Folding hid work the person didn't ask to hide, and with up to 8 columns it would fold most of them at 900 × 600. A sideways scroll keeps every column where the person put it.

### Why repair orphans instead of showing them in Backlog?
Showing them in Backlog while their stored lane says otherwise leaves ranks, reorders and counts with two readings. Moving them for real, once, keeps one rule: a task is in the column its lane names.

### Why does a single click on the name do nothing?
The name sits where people click to focus a column; opening an editor there by accident would be the opposite of calm. Keyboard and VoiceOver users open it with Return or activate, which a pointer double-click matches.

## Open questions
None.

## Implementation status
Each line is ticked by the PR that implements its plan task.
- [x] B1a: migration 0011 (#784)
- [x] B1b: `Lane` as a string id (#790)
- [x] B2a: setting row, column commands, saved folds, IPC (#792)
- [x] B2b: lane checks, orphan repair, restore into a removed column (#794)
- [x] B3: `ScrollRegion` `axis="x"` (#776)
- [x] B4a: `KanbanColumn` header (#782)
- [x] B4b: `ColumnEditor` (#783)
- [x] B5: TaskPicker order and custom columns in the picker and palette (#791)
- [x] B6: Board page: sideways scroll, saved folds, custom lanes in keys and drag (#793)
- [x] B7a: Board page: header + and arrows into the header (#795)
- [x] B7b: Board page: column editor, add and remove (#796)
- [x] B8: Close-out (#798)

Design-system artifact republished from `main` ad84e988 as service Version 78.
