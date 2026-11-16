# Task import and pointer drag on the Board (P2 close) — Spec

- Status: implemented (2026-11-16)
- Date: 2026-11-15
- Owner: Arnold Gandarillas Castillo
- Related:
  - Parent: [Board spec](2026-11-14-board.md) (Non-goals; Decisions 1, 7, 10). Runs beside [Board polish](2026-11-15-board-polish.md). ROADMAP P2 ("task import (Apple Reminders on the device; Todoist and Things exports)").
  - Issues: #582 task import, #583 pointer drag (both built here); #584 columns and #585 buffer auto-tune (rulings only); #562 neutral stats.
  - ADRs: 002 and 012 (syncable `task`, change log), 005 (permissions only when needed), 010 (OS code in `crates/platform-macos`), 014 (OS permission state is read, never stored, `docs/DECISIONS.md:209`), 018 (whole-database import, a different feature).
  - Components: reused `Dialog` (`size="sheet"`), `InlineNotice`, `Button`, `Choice` (`long`, checkbox), `ScrollRegion`; new `ImportSourcePicker`, `ImportPreviewList`; changed `Dialog`, `EmptyState`, `KanbanColumn`, `TaskCard` (design gate).
- Autonomy: the owner is running autonomously. The controller (opus) made rulings 1–11 in its brief and rulings (a)–(e) on the fable review; this spec refines them and records each under [Decisions](#decisions). The owner can overrule any of them.

## TL;DR
- **Import tasks…** reads open tasks from **Apple Reminders** (EventKit, on the device), a **Todoist** CSV or backup `.zip`, or **Things** (AppleScript), shows a **preview** where every row is a checkbox, and writes nothing until the user presses **Import N tasks**.
- One transaction appends the chosen tasks to the end of **Backlog** in source order; the Board's status line says "Imported 12 tasks to Backlog." with **Undo**, which removes the whole import.
- Each imported task remembers its **origin** (a new nullable `task.origin`, migration 0009), so a second import marks rows "Already on the Board" and leaves them unselected.
- **Pointer drag** moves and reorders cards with the same `task_move` call as the keyboard, with a placeholder, Esc to cancel and words in the live region. No HTML5 drag and drop, no new dependency.
- **#584** (add/remove columns) moves to a "Later" milestone; **#585** (buffer auto-tune) moves to P4 stats (#562). **P2 closes** when this spec's work and Board polish's have merged.

## Change in a nutshell
The import sheet over the Board (lean: Dialog `size="sheet"`, design gate decides):

```
 Import tasks
 ┌ Apple Reminders ─ Reads your open reminders on this Mac. ─────────┐
 │ Todoist ───────── Pick a CSV or backup .zip you exported. ────────│
 │ Things ────────── Reads your open to-dos. Opens Things if needed. ┘
                                                            [ Close ]
 after choosing Todoist and a file:
 Import tasks · Todoist                         12 of 14 selected  [Select none]
 3 titles were shortened; the rest is in their notes.
 ☑ Draft Q1 plan            Work · Planning · Due Fri 20 Nov · 4 checklist items
 ☐ Book dentist             Home · Already on the Board, in Today
 ☑ Renew passport           Home · Todoist date "every year" kept in the notes
 …                                                  [ Close ] [ Import 12 tasks ]
```

Board after the import: status line "Imported 12 tasks to Backlog." with *Undo*; the cards sit at the end of Backlog in source order.

Drag: press a card and move 6px; the card reads "Moving", a dashed slot titled with the card shows where it will land, the status line reads "Moving Draft Q1 plan. Esc puts it back." Release drops it there; Esc, a release on its own place or outside every column puts it back.

## Problem
People arrive with tasks in Reminders, Todoist or Things. Re-typing them is the start-up cost Orasenda exists to remove (SPEC §1.7, "starting takes as little effort as possible"), and the ROADMAP P2 row promises import. The Board also moves cards only by keys and menu (Board Decision 10), which feels broken to a mouse user.

## Goals / Success criteria
1. From the Board, the palette or Settings › Your data, a person imports open tasks from any of the three sources into Backlog, choosing rows in a preview; nothing is written before *Import N tasks*.
2. Undo right after an import removes every task of that import, in one write.
3. Importing the same source again marks what is already on the Board and selects only the new rows.
4. Every value fits the `task` limits; anything shortened, moved to notes or left out is said in words in the preview.
5. Reminders and Things ask the OS only when chosen; a denial shows a plain line and *Open System Settings*; nothing about access is stored.
6. A mouse, trackpad or pen drag reorders a card within Backlog, Today or Doing or moves it to another column, with the same result as the keyboard; Esc cancels; VoiceOver hears each step in words; a click still opens or selects.
7. Every new or changed component has a README, tests and specimens in both themes; the design-system artifact is republished from main.

## Non-goals
- Two-way sync, scheduled or background import, or any import that runs without the user pressing *Import*.
- Completed tasks, recurring rules (the next date is kept, the rule goes to notes), attachments, assignees, comment authors.
- Todoist through its API or an account; Things through its private database (needs Full Disk Access).
- Import into a column other than Backlog; editing rows inside the preview.
- Touch drag (mobile is P10); reordering inside Done; dragging a column; drag on the Inbox or Routines.
- Column add, remove or reorder (#584) and buffer auto-tune (#585): Decisions 18 and 19.

## Users & permissions
One local user.

| Source | OS permission | Asked | When refused |
|---|---|---|---|
| Apple Reminders | Reminders, full access (`NSRemindersFullAccessUsageDescription`) | the first time the user picks Reminders | "Orasenda can't read your reminders. You can allow it in System Settings." + quiet *Open System Settings* (Privacy & Security › Reminders); re-read when the window regains focus |
| Things | Automation of Things (`NSAppleEventsUsageDescription`) | the first time the user picks Things | "Orasenda can't ask Things for your to-dos. You can allow it in System Settings." + *Open System Settings* (Privacy & Security › Automation) + quiet *Try again* (Automation state can't be read without asking) |
| Todoist | none (the user picks a file in an Open panel Rust shows) | n/a | n/a |

Access is read from the OS when a source is chosen and never stored or re-asked by the app (design-system README, "Permissions at the moment of need"). **While a session is active** (`session_active`, `crates/service/src/session/service.rs:254`: running, paused or on a break), Reminders and Things are disabled with the line "Available between sessions, so nothing interrupts your focus."; Todoist stays available. The check runs again in `import_preview` before reading, and the sheet re-reads the sources whenever the timer view changes.

## Tenancy & localization
English copy, plain and kind, no exclamation marks. Dates are local `YYYY-MM-DD` read in the user's time zone; meta lines use the Board's worded dates ("Due Fri 20 Nov"), formatted in Rust (ADR-011). The why line uses the user's column names, read in Rust from `columns::read`. Non-macOS builds show Todoist only.

## Domain model

### Origin
`task.origin TEXT NULL`: where an imported task came from, `<source>:<key>`. Set once at import, never edited, synced and merged like every other `task` field.

| Source | Key |
|---|---|
| `reminders` | `calendarItemExternalIdentifier`; when it is nil, `local-` + `calendarItemIdentifier` (per device; origin syncs, so the external id comes first) |
| `things` | the to-do's Things `id` |
| `todoist` | the first 32 hex digits of SHA-256 over `project \u{1f} title \u{1f} n`, where `n` counts earlier rows with the same project and title (CSV rows have no id) |

**Matching.** A row is **already on the Board** when a live task (any lane, Done included, even past the 14-day window) has its origin: it starts unselected and reads "Already on the Board, in <column>" (the first match in lane order when several). A row whose origin matches only removed tasks starts selected, so an undone import can be redone.

### Order
Reminders: by list title, then creation date (`created_ms`), then id. Todoist: file order (in a `.zip`, entries by name). Things: the script's order, made stable by project or area, then index. Reminders subtasks arrive as separate tasks (EventKit has no parent link).

### Mapping (one source item → one task)
| Task field | Reminders | Todoist (by header name) | Things |
|---|---|---|---|
| title | title | `CONTENT` | name |
| notes | notes, then URL | `DESCRIPTION`, then `TYPE=note` rows under it | notes |
| tags | the list's title | the project (entry or file name, dropping a trailing ` [id]`, ` (n)` or ` copy`), then the section | project or area, then `tagNames` split on commas |
| priority | 1–4 high, 5 medium, 6–9 low, 0 none | `PRIORITY` 1 high, 2 medium, 3 low, 4 none | none |
| due | the due date, when it has a year, month and day | `DEADLINE`, else `DATE`, when either is an absolute date | the deadline |
| checklist | none | rows with `INDENT` above the parent's, flattened, `done: false` | none (Decision 12) |

Everything else is Deep, no estimate, lane Backlog. Only open items are read: incomplete reminders; Todoist rows of `TYPE=task` (rows with an empty or unknown `TYPE` are skipped); Things to-dos with status open, not in Trash or Logbook.

**An absolute date** is `YYYY-MM-DD` (a time part ignored) or a day, an English month name and a four-digit year in either order ("20 Nov 2026", "Nov 20 2026"). Anything else ("every day", "tomorrow", a date with no year) is not a due date; a line `Todoist date: every day` (or `Reminders time: 15:00`, `Repeats in Reminders`, `When in Things: 2026-11-20`) goes into the notes, so nothing the user wrote is lost.

**Fitting the limits** (`crates/service/src/board/check.rs:8-13`), counted per kind for the preview's summary:
- Title over 200 characters: split as *Move to Board* does (`check.rs:94`). An empty title skips the item ("1 item with no title was left out.").
- Tags: trimmed, cut to 24 characters, case-insensitive repeats dropped, at most 8 kept ("2 tasks had more than 8 tags; the rest were left out.").
- Checklist: items cut to 200 characters; past 30, the extra items become `- text` lines in the notes.
- Notes are composed in this order: the title's remainder, the source notes, the extra checklist lines, the date lines. Past 10 000 characters the cut falls on a line end, taking from the last part first ("1 note was cut to fit."). Summary lines: "3 titles were shortened; the rest is in their notes.", "1 checklist was longer than 30 items; the rest is in its notes."

## Interfaces

### Core (`crates/core`)
- `rank::spread(after: Option<&str>, n: usize) -> Vec<String>`: `n` increasing ranks after `after`, evenly spaced, each at most `len(after) + 2` characters for `n ≤ 3000` (repeated `rank::after`, `crates/core/src/rank.rs:17`, halves the gap each time and grows the string).
- `platform::import` (ADR-010 traits, pure types): `SourceAccess { NotAsked, Granted, Denied, Unavailable }`; `ReminderItem { id, title, notes, url, list, priority: u8, due: Option<DueParts { date: Option<String>, time: Option<String> }>, recurring: bool, created_ms: Option<u64> }`;
  - `trait RemindersSource: Send + Sync { fn access(&self) -> SourceAccess; fn request(&self) -> SourceAccess; fn read(&self) -> Result<Vec<ReminderItem>, PlatformError>; fn open_settings(&self) -> Result<(), PlatformError>; }`
  - `trait ThingsSource: Send + Sync { fn installed(&self) -> bool; fn read(&self) -> Result<String /* JSON */, ThingsReadError { Denied, NotInstalled, TimedOut, TooLarge, Failed(String) }>; fn open_settings(&self) -> Result<(), PlatformError>; }`. Unknown OS answers map to `Unavailable` or `Failed` (conventions, "Failures are never silent success").

### Platform (`crates/platform-macos`, macOS only)
- `reminders.rs`: `MacReminders` with **objc2-event-kit 0.3.2** (the objc2 0.3 family, `Cargo.toml:22-27`). It holds no ObjC object: each call makes its own `EKEventStore`, and `read` makes it only after access is Granted. Completions are `RcBlock`s that send over `mpsc`, as `notifier.rs:42-51` does; `EKReminder`s are mapped to `ReminderItem` inside the block, and a nil array is an `Err`. `request` (`requestFullAccessToRemindersWithCompletion`) waits for the user with no timeout; `read` (`predicateForIncompleteRemindersWithDueDateStarting(nil, nil, nil)`, `fetchRemindersMatchingPredicate`) waits 30 s, then calls `cancelFetchRequest` and returns `Err`. Neither is ever called on the main thread. The status mapping is a pure `fn access_from(EKAuthorizationStatus) -> SourceAccess` (`fullAccess` Granted; `writeOnly`, `denied`, `restricted` Denied; `notDetermined` NotAsked; anything else Unavailable). Built only when `is_app_bundle()` is true (Decision 21).
- `things.rs`: `MacThings` runs `Command::new("/usr/bin/osascript")` with no shell, `env_clear()`, stdin null, `-l JavaScript` and the script as one `-e` argument. The script is `collect(app)` plus a one-line caller that passes `Application("com.culturedcode.ThingsMac")`; it uses no `doShellScript`, no `includeStandardAdditions` and no file access, fetches properties in bulk (`toDos.name()`, …) and returns JSON `[{id, name, notes, project, area, tagNames, dueDate, activationDate}]`, with dates formatted in the script as local `YYYY-MM-DD` from `getFullYear`/`getMonth`/`getDate` (no `Date` crosses as JSON). Stdout is read on a thread, capped at 20 MB (`TooLarge`), and must be UTF-8 JSON, else `Failed`. The error number is parsed from stderr: −1743 Denied; −600 or "can't find application" NotInstalled; anything else Failed. After 120 s the child is killed and reaped (`TimedOut`). Reading opens Things when it isn't running. `installed()` asks `NSWorkspace` for the bundle id.
- `open_settings` opens `x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders` or `?Privacy_Automation`, as the notifier does for its pane (`notifier.rs:113`); the command hops to the main thread like `notifications_open_settings` (`src-tauri/src/commands/notifications.rs:18`).
- `apps/orasenda/src-tauri/Info.plist` (new; Tauri merges it): `NSRemindersFullAccessUsageDescription` "Orasenda reads your open reminders when you choose to import them. Nothing in Reminders changes." and `NSAppleEventsUsageDescription` "Orasenda asks Things for your open to-dos when you choose to import them. Nothing in Things changes." A Rust test in src-tauri parses the file and asserts both keys. `apps/orasenda/src-tauri/entitlements.plist` (new) holds `com.apple.security.automation.apple-events` and `com.apple.security.personal-information.calendars` for the hands-on signed check; it is not wired into `tauri.conf.json` until the release workflow (ADR-003) does.

### Store (`crates/store`)
- `migrations/0009_task_origin.sql`: `ALTER TABLE task ADD COLUMN origin TEXT CHECK (origin IS NULL OR (length(origin) BETWEEN 3 AND 300 AND instr(origin, ':') > 1))` and `CREATE INDEX task_origin ON task (origin) WHERE origin IS NOT NULL`. Added to the list at `crates/store/src/migrate.rs:16-17`; `SCHEMA_VERSION` 9 (`crates/store/src/lib.rs:44`).
- `repo/tasks.rs`: `NewTask.origin` and `TaskRow.origin` (logged on insert like `source_note_id`), in `COLUMNS` and `read_row` (`repo/tasks.rs:121,319`); `origins(txn, &[String]) -> Vec<(String, Lane, bool /* live */)>`; `last_backlog_rank(txn)` including tombstones, as `end_of_lane` does (`portability/merge/tasks.rs:94-99`).
- Portability: `rows.rs` (`TaskRowAll.origin`, the `SELECT` at `rows.rs:184-190`) and `merge/tasks.rs` (the column list at `merge/tasks.rs:20-24`). Snapshot and stats need no change.

### Service (`crates/service/src/import/`)
Parsers and mapping are pure (`todoist.rs`, `things.rs`, `reminders.rs`, `fit.rs`, `origin.rs`); `run.rs` holds the `run_*` functions and calls `board::write`; `rank_at`, `split_note` and the limits in `board/check.rs` become `pub(crate)`. `Host` gains `reminders() -> Option<Arc<dyn RemindersSource>>` and `things() -> Option<Arc<dyn ThingsSource>>` (`None` off macOS). No OS wait happens under the service lock: reading runs first, then the lock is taken for matching.
- `run_import_sources(host) -> ImportSourcesView { sources: [{ kind, available, reason? }] }`, in the order Reminders, Todoist, Things (macOS) or Todoist (elsewhere).
- `run_import_preview(host, request: PreviewRequest) -> Result<ImportPreview, ImportError>`, `PreviewRequest = Reminders | Things | Todoist(PathBuf)`. Reads, maps, fits, matches origins and keeps the result as the service's one **pending preview**, replacing any other. Its id is a per-process `u64` counter.
- `run_import_discard(host, preview_id)`: drops the pending preview if it is that one.
- `run_task_import(host, preview_id, keys: Vec<u32>) -> Result<ImportDone, ImportError>`: one write that inserts the chosen items in source order at `rank::spread(last_backlog_rank, n)`, then emits `board-changed` after the lock. Rows are not re-matched. The pending preview is consumed only when the write commits; no keys, a key not in the preview or an id that isn't pending answers `stale` and writes nothing. The service keeps the committed import's task ids as the **last import**.
- `run_task_import_undo(host, import_id) -> Result<u32, ImportError>`: one write that tombstones every task of the last import that is still live; answers how many. An id that isn't the last import answers `stale`.
- `run_import_open_settings(host, kind)`.
- Types: `ImportSourceKind = reminders | todoist | things`. `ImportPreview { id, source, sourceName, items: ImportItemView[], total: u32, line?: string, summary: string[] }`. `ImportItemView { key: u32, title, meta: string, why?: string, selected: bool, onBoard?: Lane }`. `ImportDone { importId, count: u32 }`. `ImportError { kind: denied | notInstalled | unavailable | sessionActive | notAnExport | unreadable | tooLarge | timedOut | stale | store, message }`, each message the line the UI shows.

### IPC (`apps/orasenda/src-tauri`)
Thin `commands/import.rs`: `import_sources`, `import_preview(source) -> ImportPreviewOutcome { picked: ImportPreview } | { cancelled }` (async, on the blocking pool; Todoist first shows the Open panel through `FilePicker::open_import() -> Result<Option<PathBuf>, DataError>` for `.csv` and `.zip`, beside `open` at `file_picker.rs:10-15`, its error mapped to `unreadable`), `import_discard(previewId)`, `task_import(previewId, keys)`, `task_import_undo(importId)`, `import_open_settings(source)`. No new event: `board-changed` carries the result. Capability entries, `build.rs` manifest, regenerated bindings.

### Components (`packages/ui`, code-first: `.tsx`, `<kebab>.md`, test, specimen)
- **New `ImportSourcePicker`**: `sources: { kind, name, description, disabledReason? }[]`, `reading?: kind` (that row reads "Reading…", `aria-busy`), `onPick(kind)`. A list of `hit-min` rows (name in `body`, description in `body-sm` `ink-muted`), one tab stop with ↑/↓ roving; a disabled row keeps its reason visible and linked by `aria-describedby`.
- **New `ImportPreviewList`**: `label`, `items: { key, title, meta?, why?, checked }[]`, `onToggle(key)`, `onSetAll(checked)`, `summary?: string[]`. A count line ("12 of 14 selected", not live), a quiet *Select all* or *Select none* button (whichever applies), the summary lines, then one row per item built from `Choice long` with `type="checkbox"` (`choice.md:8`): the title as the chip's title, the meta and why lines as its description. The rows sit in a `role="group"` named by `label`, with one tab stop on purpose (roving ↑/↓, Home/End; Space toggles), because a preview can hold 500 rows. Rows sit `space-2` apart, each at least `hit-min`.
- **Changed `Dialog`**: `confirmLabel` optional (no confirm button without it, for the source step); `confirmDisabledReason?` disables the confirm and shows the reason under the actions, linked by `aria-describedby` ("Select at least one task to import."); `loading` on the confirm while writing ("Importing…"). `dialog.md`'s sheet line is amended: a sheet that edits saves on change (Done/Close); a sheet that stages one action (the import) has that action as its confirm.
- **Changed `EmptyState`**: `secondaryAction?: { label, onAction }` adds a ghost button after the quiet action, for the empty Board's *Import tasks…*. `empty-state.md`'s "at most one quiet action" becomes "one quiet action and at most one ghost action".
- **Changed `KanbanColumn`**: `drop?: { index: number; label: string }` draws the slot at `index`, counting children with the dragged card left out (a `hit-min` dashed `line-strong` well with "Moving <title> here" in `body-sm`). On a collapsed column `index` is ignored and the strip shows the `selection` ground and the words "Move here". `kanban-column.md`'s "Don't: implement drag here" becomes "the board owns the drag; the column only draws the slot".
- **Changed `TaskCard`**: `moving?: boolean`: a dashed `line-strong` edge and the word "Moving" (never opacity). `task-card.md`'s "there is no drag here" is amended. Lands after Board polish's `TaskCard` changes (#575, #580).

### App (`apps/orasenda/src`)
- `features/board/import/ImportSheet.tsx` and `useImport.ts`: the steps *source → reading → preview*; the denial and failure lines (`InlineNotice` with its action); an empty source as the default `EmptyState` ("No open tasks in Reminders.") with *Choose another source*. The sheet opens with focus on the first source row (`initialFocusRef`); the preview step focuses the list. Closing the sheet or changing the source calls `import_discard`; a preview answer that isn't the latest request is dropped. `BoardPage` mounts it and gains `importAsked: number` (a counter the app bumps).
- Entry points (design gate): a quiet "Import tasks…" button in the Backlog column's footer under *New task*; the empty Board's `EmptyState` message becomes "Add one, move a note from the Inbox, or import tasks." with *Import tasks…* as its `secondaryAction`; the palette gains "Import tasks…" (`app/palette/paletteCommands.ts`); Settings › Your data gains a row "Tasks from other apps" with a quiet "Import tasks…" beside *Export data…* and *Import data…* (`panes/YourData.tsx:152-166`). Palette and Settings go to the Board, then open the sheet.
- After *Import*, the sheet closes and the Board's status line (`BoardPage.tsx:119-144`, the line *remove* uses, `useBoardActions.ts:175-184`) reads "Imported 12 tasks to Backlog." with *Undo* (name "Undo importing 12 tasks"), which stays until replaced. Undo answers "Import undone."
- `features/board/useCardDrag.ts`: the pointer drag (Behavior).

## Behavior & edge cases

### Import
- **Nothing is automatic.** No entry point opens itself, prompts or badges; reading starts only from a picked source; writing only from *Import N tasks*.
- **Selection:** new rows and rows that match only removed tasks start selected; "Already on the Board" rows start unselected and stay selectable. With none selected the confirm is disabled with its reason.
- **Huge source:** at most 500 rows. With more than 500 open items the preview holds the first 500 that are not on the Board, and `line` reads "Showing 500 of 812. Import these, then choose Import tasks again for the rest."
- **Files:** the size is checked from metadata before reading: over 20 MB is "That file is too large to be a Todoist export." A `.zip` is read in memory through a capped reader (50 MB unpacked in total, declared sizes not trusted, nothing written to disk), at most 500 entries; only top-level `*.csv` entries count, and directories, `__MACOSX/`, nested archives and encrypted entries are skipped. Entry names serve only as the project tag. A UTF-8 BOM is skipped; quoted cells with commas, quotes and line breaks follow RFC 4180.
- **Errors, each one plain line in the sheet with a way on:** not a Todoist export (no `TYPE` and `CONTENT` headers, not UTF-8, or a `.zip` with no CSV): "That file doesn't look like a Todoist export."; unreadable: "Orasenda couldn't open that file."; Things missing: "Things isn't on this Mac."; Things timed out: "Things didn't answer. If macOS asked for permission, answer it, then try again."; Things output over 20 MB: "Things sent more to-dos than Orasenda can read at once."; Reminders read failed or timed out: "Orasenda couldn't read your reminders. Try again."
- **Cancelled panel or prompt:** a cancelled Open panel leaves the source step as it was. A dismissed permission prompt counts as the OS answer and shows the matching line.
- **Stale:** a `task_import` that answers `stale` shows "That preview is out of date. Choose the source again." and keeps the sheet open.
- **One transaction:** quitting during reading writes nothing; quitting during the import write leaves all or nothing. A failed write: "The tasks weren't imported. Try again." with *Try again*, and the preview stays pending.
- **Undo** removes the tasks of the last import even if some were edited or moved since; those already removed are skipped. It is offered only in the status line that answered the import.
- **A running session:** import from Todoist is allowed (it only adds Backlog tasks); data import's `Busy` refusal (`crates/service/src/data/import.rs:34-36`) does not apply.

### Drag (#583)
- **Pointer events only,** mouse and pen (`pointerType` touch is ignored), on the board root: `pointerdown` (primary button, on a card's button, not its menu button) arms; a move of 6px (`DRAG_START_PX`, a behaviour constant, not a style) starts the drag with `setPointerCapture` and turns `user-select` off; below it the press stays a click (select or open). The click that ends a real drag is swallowed.
- **The dragged card stays in place,** marked "Moving". There is no slot at its own place, and a release there is a cancel.
- **Target in Backlog, Today and Doing:** hit-tested against card rects measured at drag start plus the scroll offsets, recomputed on `pointermove`, `scroll` and `wheel`; the index sits between the cards whose midpoints surround the pointer, with the dragged card left out, matching `rank_at`'s `except` (`board/service.rs:115-133`).
- **Done takes a drop as a whole** with one slot at its top: `task_move(id, done, 0)`. Done lists by `done_at` descending (`crates/store/src/repo/tasks.rs:207-212`), so its visible order is not a rank order. A drag that starts and ends in Done is a cancel ("<title> stayed in Done."). A folded strip takes a drop at its column's end (Done: its top).
- **Edge scroll:** a `hit-min`-tall zone at the top and bottom of a card list, and of the compact `ScrollRegion`, scrolls one step per animation frame; reduce-motion changes only the easing of the cards making room.
- **Drop** calls `task_move(id, lane, index)`, the call behind ⌥⌘ arrows and the Move menu (`useBoardActions.ts:84-95`). Limits behave as for a key move: a drop past a limit is allowed and the column reads "4 of 3"; nothing moves back (only a start does, Board Decision 15). A drop in Done sets `done_at`; out of Done clears it.
- **Cancel:** Esc (consumed, so nothing else sees it), `pointercancel`, the window losing focus, a release on its own place or outside every column: the card stays where it was.
- **Words:** start "Moving <title>. Esc puts it back."; another column "Moved <title> to <column>." (the keyboard's line); a reorder "Moved <title> to place 3 in <column>." (a keyboard reorder stays silent, `useBoardActions.ts:115`, because focus follows the card); cancel "<title> stayed in <column>." All through the Board's status line; focus lands on the dropped card.
- **Motion:** cards make room for the slot over `duration-calm` on `easing-calm`; under reduce-motion nothing animates. No ghost image follows the pointer: the slot shows where the card lands, in words and shape. (Deferred to #646, controller ruling: the slot appears without the opening motion for now.)
- **The keyboard stays the contract.** Every drag result is reachable by ⌥⌘ arrows and the Move menu; nothing is drag-only.

## Data & migrations
- `0009_task_origin.sql` (next after `0008_board.sql`). If a parallel session lands a 0009 first, the second to land renumbers and fixes `SCHEMA_VERSION`. Existing rows get `origin` NULL; nothing is back-filled.
- Older data files import fine (ADR-018 migrates the copy; `origin` NULL). A file with origins into an older app is refused by the schema-version check.

## Testing strategy
- **Core:** `rank::spread` (ordered, after the bound, at most `len + 2` at 3000, empty lane, after a tombstone's rank).
- **Parsers (Rust, fixtures in `crates/service/src/import/tests/fixtures/`):** Todoist CSVs with sections, three indent levels, notes rows, quotes, commas and multi-line cells, a BOM, missing headers, reordered columns, unknown `TYPE`, project names with ` [id]`, ` (2)` and ` copy`; backup `.zip`s with `__MACOSX/`, a nested folder, a nested archive and an oversized entry; Things JSON with projects, areas, comma tags, deadlines and when-dates (the JXA date format); Reminders mapping from `ReminderItem` values (priorities 0–9, date with and without time, recurring, URL, ordering). Every fit rule, the notes order and cut, and its summary count; absolute and relative dates.
- **Platform (pure parts only; `MacReminders` and `MacThings` are never constructed in tests):** `access_from` for every status; the osascript stderr parser; on macOS CI, `collect` run under `osascript` against a stub object, checking the JSON and the date format.
- **App crate:** the Info.plist test (both keys).
- **Service (fakes for both traits):** preview writes nothing; import inserts in source order with spread ranks and origins, logs `change_log`, emits `board-changed` after the lock; matching (live in any lane, Done past 14 days, removed only, several matches); Undo and its `stale`; discard; stale keys and ids; a failed write keeps the preview; denied, not installed, timed out, session active; the 500 cap.
- **Store:** migration 8→9 on a filled database; origin round-trips through export and merge.
- **Components (vitest + specimens, both themes):** `ImportSourcePicker`, `ImportPreviewList` (roving group, Space, select all/none, names and descriptions, count), `Dialog` (no confirm, disabled reason, loading), `KanbanColumn` (slot, strip), `TaskCard` (`moving`); `just contrast` for any new pair.
- **App (vitest):** the sheet's steps, errors, empty source and dropped stale answers; each entry point; the import line with Undo; drag below and past the threshold, touch ignored, drop between and within columns, Done as a whole, a release on its own place, Esc consumed, release outside, folded strip, the swallowed click, the announcements.
- **Layout (WebKit):** the import sheet at 1440×900, 900×600 and 640×480 (no page scroll, list scrolls, actions pinned, hit-min rows, focus ring); the drag slot in a regular and a compact board.
- **Owner's hands-on check (end of run, a bundled debug build):** see [Hands-on](#hands-on-check). To repeat a first prompt, `tccutil reset Reminders <bundle id>` and `tccutil reset AppleEvents <bundle id>`; if that fails, a throwaway identifier (`docs/common-issues.md`, the `tccutil` entry).
- **Review checklist** as the Board spec's, plus: nothing imported without the button; permission asked only from its source.

## Design gate
The canvas is https://claude.ai/artifact/N3RphAWsq8PnMhMMwzBq7R, with options A1–A3, B1–B3 and C1–C2; the leans are A2, B1 and C1. Until the owner records a pick, the leans stand; the owner can overrule them.
- **(a) Entry point on the Board.** A1: a quiet "More board actions" `IconButton` beside *Add task* opening a `PopoverMenu` with "Import tasks…" (needs a `PageFrame` slot). A2: a quiet "Import tasks…" button in the Backlog column's footer, under *New task*, where imports land. A3: no Board control, only the palette, Settings and the empty Board. **Lean A2** (no header change, next to where the tasks appear, quiet), always with the palette and Settings.
- **(b) Preview layout.** B1: the task sheet's `Dialog size="sheet"`, the list spanning both grid columns. B2: a `panel` dialog. B3: a Board page state on `PageFrame`'s flow variant (footer *Close* and *Import N tasks*). **Lean B1**: the Board detail's pattern, over the scrim, actions pinned.
- **(c) Drag look.** C1 and C2 show the slot, the "Moving" card and the strip's "Move here" in both themes. **Lean C1.**

## Decisions
Controller rulings refined here (opus, 2026-11-15, under the owner's autonomy ruling):
1. **One spec for #582 and #583; #584 and #585 are rulings only.**
2. **Three sources, three paths:** EventKit in `crates/platform-macos` (objc2-event-kit 0.3.2); a Todoist CSV or backup `.zip`, parsed by header name; Things through JXA run by `/usr/bin/osascript`. Reminders and Things are `#[cfg(target_os = "macos")]`; Todoist works everywhere.
3. **Permissions only when the source is picked, never stored, never while a session is active.** Reminders and Things are disabled while `session_active`; Todoist needs no permission and stays.
4. **The service keeps one pending preview; the webview sends keys.** It is consumed only by a committed write and dropped by `import_discard`; anything else answers `stale`.
5. **`task.origin` column, not a side table.** One `ADD COLUMN` is one more field in the existing log, merge and export paths; a side table would need its own id, timestamps, tombstone, merge and export code for one string per task.
6. **Origin keys** as in the Domain model: Reminders' external identifier first because origin syncs; Todoist hashes project, title and repeat count with SHA-256 (32 hex).
7. **"Already on the Board" means a live task with that origin, in any lane;** removed-only matches start selected (ruling c), so an undone import can be redone.
8. **Undo by import id; the service keeps the last import's task ids** (ruling d). It answers in the Board's status line (the remove pattern), not a separate `Toast`.
9. **Nothing the user wrote is dropped silently:** long titles and checklists spill into notes in a fixed order; only tags past 8 and notes past 10 000 are cut, and the preview says so.
10. **A due date only from one absolute date;** other date text goes to the notes.
11. **Priorities:** Reminders 1–4 high, 5 medium, 6–9 low; Todoist p1 high, p2 medium, p3 low, p4 none, with CSV `PRIORITY` 1 = p1.
12. **No Things checklists.** Things' AppleScript dictionary is not known to expose checklist items; its to-dos import without one, and the summary says "Things doesn't share checklists, so they stay in Things."
13. **500 rows at most, new rows first past the cap.**
14. **New dependencies, each vetted by `baton:deps` in the plan:** `objc2-event-kit` 0.3.2 (platform-macos); `csv` 1.4.0, `zip` (`default-features = false, features = ["deflate-flate2"]` with `flate2`'s `rust_backend`; `flate2` and `miniz_oxide` are already in `Cargo.lock`, and no `zopfli`, `aes` or `time` crate may enter) and `sha2 = "0.10.9"` (unified with `Cargo.lock:2923` through Tauri) in `crates/service`. All go in `[workspace.dependencies]`.
15. **`rank::spread` for a batch,** after the last Backlog rank including tombstones, so 500 appended ranks stay short.
16. **Entry points lean A2, preview lean B1** (Design gate).
17. **Drag: pointer events (mouse and pen), a 6px threshold, a placeholder slot and no ghost, Done as a whole, Esc cancels, words in the status line.** HTML5 drag and drop clashes with the Tauri window's file-drop handling (Board Decision 10).
18. **#584 (add, remove, reorder columns) leaves P2.** P2's exit criterion doesn't need it, and Doing and Done carry meaning (session linking, `done_at`). It moves to a new "Later" milestone, which the controller creates at close-out.
19. **#585 (buffer auto-tune) moves to P4 neutral stats (#562).** It needs weeks of linked sessions, and stats is where estimated-vs-actual history lives. #585 stays open with a `P4` label and a comment linking #562.
20. **P2 closes when this spec's work and Board polish's have merged** (ruling b). "Every session can be linked to a task (optional), with estimated vs actual time" already holds after the Board. The close-out edits `docs/ROADMAP.md:25,39` and the Board spec's Follow-ups (`2026-11-14-board.md:240-246`).
21. **Reminders needs the app bundle,** gated as a precaution: outside a bundle (dev, tests) TCC attributes access to the terminal, so Reminders reads "Reminders works in the installed app only."
22. **Todoist import runs during a session;** only the OS-reading sources wait (Decision 3).
23. **No pre-plan spike** (ruling a). The TCC prompts need a human click and the owner is away until the end of the run. The plan builds the defaults (osascript by absolute path; the external identifier with the `local-` fallback; no Things checklists); every unknown degrades to a plain failure line, never a crash or a silent success; CI covers the Info.plist keys, the pure status mapping and `collect` under osascript; the rest is the owner's hands-on check.
24. **Status "approved"** for the autonomous run (ruling e).
25. **`EmptyState` gains one ghost `secondaryAction`** (found while planning): the empty Board shows no Backlog footer, so its import entry needs a second button, and the README allowed only one.

## FAQ
### Why not read Things' database?
`main.sqlite` sits in Things' container, needs Full Disk Access (far more than this needs) and has a private schema that can change with any update.

### Why keep Todoist to CSV files?
An API import needs an account token and a network call, against ADR-008's "nothing leaves the device"; the CSV is what Todoist already gives every user.

## Open questions
None block the plan. Each item below is confirmed in the owner's hands-on check, and the code ships with the safe default named.

### Hands-on check
1. The Reminders prompt and real reminders in a bundled debug build. Default: a denial or an unknown status shows the plain line.
2. The Things Automation prompt names Orasenda (not `osascript`) and real to-dos import. Default: `/usr/bin/osascript`; a refusal or an error shows the denial or failure line.
3. A hardened-runtime signed build (`codesign --options runtime` with the entitlements file: `com.apple.security.automation.apple-events`, and `com.apple.security.personal-information.calendars` if Reminders needs it) still reads both sources. Default: without the entitlement the read fails with a plain line.
4. Both `Privacy_*` anchors open the right panes on macOS 15 and 27. Default: the Privacy & Security pane at its top.
5. `calendarItemExternalIdentifier` stays stable across a re-import. Default: an item that changed id shows as new, and the user can deselect it.
6. Things' scripting really has no checklist items. Default: none imported.
7. A real Todoist CSV and backup `.zip`: the `PRIORITY` direction (1 = p1), the `DATE` text, dates without a year and a `DATE_LANG` other than English. Default: anything not an absolute date goes into the notes.
8. Denial and *Open System Settings* for both sources; a drag with a trackpad, a mouse and a pen.

## Implementation status
Implemented (2026-11-16). Plan: [2026-11-15-task-import](../plans/2026-11-15-task-import.md). Merged PRs:
- I1 #613, I2 #614, I3 #622, I4 #620, I5 #621, I6 #627, I7a #632, I7b #639, I8 #640, I9 #615, I10 #629, I11 #642, I12 #644, I13 #645, and I14 #647.

Design gate: the canvas leans A2, B1 and C1 shipped. The owner may still overrule (canvas https://claude.ai/artifact/N3RphAWsq8PnMhMMwzBq7R).

### Follow-ups
- #646: the drag's slot-opening motion is deferred (controller ruling).

Hands-on check: see above; it stays with the owner.
