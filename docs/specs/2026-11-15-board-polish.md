# Board polish: GitHub CI, shared single-key setting, rows and the palette's task (P2) — Spec

- **Status:** implemented (2026-11-16)
- **Date:** 2026-11-15
- **Issues:** #587, #574, #575, #580, #581 (follow-ups of the Board, epic #545)
- **Follows:** [the Board spec](2026-11-14-board.md)

## TL;DR
Five small follow-ups to the Board, done before task import. First, GitHub CI completes green on `main` again (#587). Then four Board follow-ups: one shared single-key hook (#574), clamped card titles (#575), rows that are one tab stop and open their menu from the keyboard (#580), and palette commands that choose or clear the session's task (#581).

## Change in a nutshell
- **CI (#587).**
  - A run on `main` is never cancelled.
  - The Windows advisory `guard.test.ts` normalises paths before matching them.
- **Single keys (#574).** `useSingleKeySetting(): { on, failed }` moves to `@domain/keyboard`. Board, Inbox and Routines import it, and the two `useSingleKeyOn` copies go away. This is a move, not a behaviour change.
- **TaskCard (#575).** In `density="card"` the title shows at most 3 lines, with an ellipsis. The full title stays in the accessible name.
- **Rows (#580).**
  - An `InboxRow` or `TaskCard` that roves is one Tab stop: its More actions button gets `tabIndex=-1`.
  - ⇧F10 or the ContextMenu key on the focused row opens its menu.
  - The More button's tooltip names ⇧F10.
  - A menu opened by key returns focus to the row when it closes.
- **Palette (#581).** Two new commands:
  - *Choose a task…* reopens the palette as a list of the tasks that aren't Done.
  - *Clear task* is listed only while a task is linked.
  - Both call `timer_set_task`. Neither is ever suggested or prompted.

## Problem
- **The Windows advisory job fails at `ui (tests)`** (`justfile:121`), and has done since H.
  - The test is `packages/ui/guard.test.ts › source_critical_only_in_dialog_destructive_and_button_critical`.
  - It tests the `allowed` regex against raw paths (`:72-74`), strips `${dir}/` (`:76`), then filters `^(types|index)` (`:78`). All three assume `/` separators. Lines `:44` and `:49` strip paths the same way.
  - Because the job dies there, no later step has run on Windows since H.
- **The same settings-reading hook exists three times:** `features/board/useSingleKeyOn.ts:9`, `features/inbox/useSingleKeyOn.ts:9` and `features/routines/useRunKeys.ts:16-42`. conventions.md (`docs/conventions.md:67`) puts code two features share in `domain/`. No test covers any of the three.
- **A long title can make a card taller than its column.**
- **Roving rows still put every More button in the Tab order.** Under macOS Full Keyboard Access or WebView2, Tab walks every one.
- **Short windows can't show the TaskPicker.** Below 480 px high, Today's stacked strip and short ring hide it (`Today.tsx:350`), so a task can't be picked, seen or cleared there.

## Goals / Success criteria
1. The first push to `main` after #587 merges gets a green GitHub `ci` check. The required context is still `ci`.
2. Locally, `./scripts/ci.sh` (and so `baton verify`) still runs every check.
3. `guard.test.ts` passes on Windows. Steps after `ui (tests)` will run there for the first time since H. A later step that fails gets its own issue (Decision 2).
4. `useSingleKeyOn` exists nowhere. Board, Inbox and Routines all use `@domain/keyboard/useSingleKeySetting`. Their existing tests pass with only import changes, and the hook has its own tests.
5. In `density="card"`, a long title is clamped to 3 lines, and the full title stays in the accessible name.
6. On Inbox and Board:
   - Tab from a row leaves the list.
   - ⇧F10 and ContextMenu open the focused row's menu.
   - With `keys.single_key` off, every menu action, Move to Board included, still works from the keyboard.
7. At any size of the main window, the palette can choose a task for the session or clear it.

## Non-goals
- New behaviour in Routines. #574 changes only where `RunView.tsx` imports the hook from, and removes the hook from `useRunKeys.ts`.
- A palette in the floater or the capture window.
- Task import, drag, column editing and buffer auto-tune. These are Phase 2, with their own spec.

## Users & permissions
These are local, single-user desktop features with no new permissions. CI keeps `permissions: contents: read` and needs no new secrets.

## Tenancy & localization
Not applicable: there is one local user, and the copy is English only, as elsewhere in P2.

## Domain model
No change. "Linked task" keeps its Board-spec meaning: the task a focus session records time against, set with `timer_set_task` and shown as `TimerView.task` (`bindings.ts:1760`).

## Interfaces

### CI (`.github/workflows/ci.yml`)
- **Concurrency:**
  - `group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`
  - `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`
  - Each push to main gets its own group, so no main run is cancelled or dropped while pending.
- **Windows** stays advisory. It keeps running `./scripts/ci.sh`.
- **guard.test.ts** gains a local `rel(f)`: `relative(dir, f)` with `\` replaced by `/`. It is used at `:44`, `:49` and `:76`, and before the `allowed` test at `:73`. A seeded assertion in the same file, in the style of `:53-58`, shows that `rel` turns a `\` path into the `/` form.

### `@domain/keyboard/useSingleKeySetting.ts`
- `export function useSingleKeySetting(): { on: boolean; failed: boolean }` is the body of `features/routines/useRunKeys.ts:16-42`, moved.
- It logs one console message: `"settings_get failed: single keys stay off"`.
- Board (`BoardPage.tsx:22,43`) and Inbox (`InboxPage.tsx:9,24`) read `.on` only, as today. Routines (`RunView.tsx:14,141`) reads both.
- `useRunKeys.ts` stops exporting it. The two `useSingleKeyOn.ts` files are deleted.
- New `useSingleKeySetting.test.ts` covers four cases:
  - single keys are off until the settings are read;
  - an event beats a late `settings_get`;
  - `failed` is set when the read is rejected;
  - the next event clears `failed`.

### `TaskCard` (`packages/ui/src/components/ui/task-card.tsx`)
- In `density="card"`, the title span (`:218`) gets `line-clamp-3`. The closed theme compiles it to `-webkit-line-clamp: 3`, so it is not an arbitrary value. The root already has `wrap-anywhere` (`:164`).
- The interactive card's name comes from `aria-label` (`:282`), so it keeps the full title.
- The read-only `<article>` form (`:288`) has no `aria-label`. It gets an `sr-only` full title, and the clamped visible span is `aria-hidden`.
- `density="row"` is unchanged.
- The README, test and specimen get a long-title case.

### `InboxRow`, `TaskCard`, `IconButton`, `PopoverMenu`: one tab stop
- **`menuTabIndex?: 0 | -1`** (default `0`) on both rows, passed to the row's More actions `IconButton`.
  - `IconButton` already takes `tabIndex?: -1 | 0` (`icon-button.tsx:21-22`). Its doc comment is widened beyond "a scroll helper".
  - The prop doesn't apply to InboxRow's Remove button when there's no menu (`inbox-row.tsx:97`).
- **The menu key is handled inside each component, with no new callback prop.**
  - On the focused row or card, `ContextMenu`, or `F10` with Shift, opens that component's own menu with focus on its first item. The handler calls `preventDefault` and runs before `props.onKeyDown`.
  - It also calls `preventDefault` on the native `contextmenu` event that follows a keyboard ⇧F10 in WebView2.
  - TaskCard lifts `open` from `CardMenu` (`task-card.tsx:105`) into `TaskCard`.
  - On a disabled card, or a card with no `menu`, the key does nothing (`task-card.tsx:292`).
- **The More button gets `shortcut="⇧F10"`**, so its tooltip and `aria-keyshortcuts` show it (`icon-button.tsx:6,10`).
  - `packages/ui/src/lib/shortcuts.ts` learns F10 if `describeShortcut` doesn't accept it yet.
  - The issue asks for a way to discover the key on macOS, where there's no ContextMenu key; this is it.
- **PopoverMenu gains `returnFocus?: RefObject<HTMLElement | null>`**, documented in `popover-menu.md`.
  - When it is set, close, choose and Esc focus that element instead of the first focusable in `anchor` (`popover-menu.tsx:60-61,210-213`).
  - A menu opened by key passes the row or card. A menu opened by click passes nothing, so focus returns to the More button, as today.
  - Tab out of the menu is unchanged, because `nextTabbable` skips `tabIndex < 0` (`:75`).
- **Callers:**
  - Inbox passes `menuTabIndex={-1}` to rows that rove.
  - On the Board, `BoardCard.tsx:22-38` passes `menuTabIndex={-1}`. (`useBoardKeys.ts:51-54` sets `tabIndex` only on card buttons, by DOM query.)
  - The Board's capture handler already lets Shift chords through (`useBoardKeys.ts:100`), so ⇧F10 reaches the card.
- **READMEs:** `inbox-row.md`, `task-card.md`, `icon-button.md` and `popover-menu.md` document the props and the key.

### Palette (`apps/orasenda/src/app/`)
- **App's palette state** (`App.tsx:122-129,233-235`) becomes `"closed" | "all" | "displays" | "tasks"`.
  - `Palette` gets `onMode(mode)`.
  - App mounts `Palette` with `key={palette}`, so a mode change remounts it with an empty query (`command-palette.md:4`: "Mount a fresh instance per invocation").
  - The opener App saved when it first opened the palette is the one focus returns to after the remount (`command-palette.tsx:14-20`).
- **`PaletteInput`** gains `tasksOnly?: boolean` and `tasks: TaskPickerOption[]`, read through `useTaskOptions`. That hook follows `board-changed` (`domain/board/useTaskOptions.ts:33`), so the list is live.
- **In the full list:**
  - *Choose a task…* comes right after the session commands (`paletteCommands.ts:139-146`). It is listed only when at least one task isn't Done.
  - Selecting it calls `onMode("tasks")`.
  - *Clear task* comes next. It is listed only when `view.task` is set, and calls `timer_set_task(null)`.
- **In task mode:**
  - The rows are the tasks that aren't Done, sorted by the palette itself: Doing, then Today, then Backlog, each in board order. `taskOptions` returns board column order (`useTaskOptions.ts:9-21`); TaskPicker sorts inside its component (`task-picker.tsx:34,48`).
  - Each row has label = the title, and hint = the column's name in words, plus " · Frog" for the Frog. The palette filter matches both label and hint (`command-palette.tsx:74-76`).
  - Enter calls `timer_set_task(id)`.
  - Esc closes the palette, with no step back to the full list.
  - The dialog title and list label stay "Commands", as in display mode.
- **Failures** use the palette's existing line: `report("choose that task")` and `report("clear the task")` (`Palette.tsx:103-106`). `taskNotFound` and `taskDone` get that same generic line on purpose: the list is live, so either can only come from a race.
- **No command is promoted, prompted or pre-selected.**

## Behavior & edge cases
- **Single keys:** while the settings are unread, single keys stay off. A `settings-changed` event wins over a late `settings_get`, as today.
- **TaskCard clamp:** a single long word wraps (`wrap-anywhere`). The `active` and Frog markers are outside the clamped span (`:211`, `:221`), so they stay visible.
- **Rows:**
  - `menuTabIndex=-1` applies whenever the row roves, including while its menu is open. A click still opens the menu.
  - A row that doesn't rove (a lone specimen) keeps `0`.
  - ⇧F10 while the row's menu is open does nothing more.
  - With single keys off, ⇧F10 → *Move to Board* works on the Inbox. That is now the only keyboard path to it, because B is gated by single keys (`InboxPage.tsx:24`).
  - The same PR fixes the Inbox test from #580: `InboxPage.move.test.tsx:250-253` turns fake timers on only after pressing B, so it must turn them on first.
- **Palette:**
  - Choosing the task that is already linked still calls `timer_set_task(id)`, which leaves the link as it is.
  - During a running session the change applies to that session, as with TaskPicker (Board spec, "Session ↔ task").

## Data & migrations
None.

## Testing strategy
- **CI:**
  - #587 is done when the first `main` run after the merge is green.
- **guard.test:** the seeded `rel` assertion.
- **#574:** `useSingleKeySetting.test.ts`, with the four cases above. The existing Board, Inbox and RunView tests stay green.
- **#575:**
  - In vitest: a long title keeps the full accessible name, in both the button form and the read-only form.
- **#580:**
  - In vitest, for both components:
    - Tab from a row leaves the list.
    - ⇧F10 and ContextMenu open the menu with focus on its first item.
    - Esc returns focus to the row after a key-opened menu, and to the More button after a click-opened one.
    - The `contextmenu` default is prevented after ⇧F10.
  - The Inbox page test: with single keys off, ⇧F10 → *Move to Board* works.
- **#581:** palette tests:
  - *Choose a task…* is listed or hidden as specified, and so is *Clear task*.
  - Selecting *Choose a task…* remounts the palette with an empty query.
  - The order and hints in task mode.
  - Enter calls `timerSetTask(id)`, and *Clear task* calls `timerSetTask(null)`.
  - The failure line.
  - Esc closes the palette.
- **Review checklist** (each UI PR):
  - tokens only;
  - both themes;
  - a focus ring;
  - hit-min targets;
  - names and roles;
  - no state shown by colour alone;
  - calm copy.

## Decisions
1. **Main runs are never cancelled or dropped.** Each SHA gets its own group, because with one group per ref GitHub would still drop a pending run when a third push came. PR runs still cancel older runs on the same branch.
2. **The Windows fix is limited to guard.test's paths.** A later Windows step that then fails gets its own issue and doesn't block #587, which is about macOS.
3. **#574 is a mechanical move.**
   - The domain hook is Routines' version, with `failed`, as the issue asks.
   - Board and Inbox don't start showing a failure line. That would be a behaviour change; file it if it's wanted.
   - In Routines code, only `RunView.tsx` (the import) and `useRunKeys.ts` (the export removed) change.
4. **The clamp is 3 lines**, as the issue suggests. The sheet shows the full title, so there's no tooltip.
5. **#580 uses ⇧F10 and the ContextMenu key, the Windows and web convention.**
   - macOS has no ContextMenu key, and F10 needs Fn on laptop keyboards.
   - So the More button names ⇧F10 in its tooltip and `aria-keyshortcuts`.
   - Rows get no single-key menu key, so `keys.single_key` isn't involved.
   - Focus returns to where the menu was opened from.
6. **#581 reuses the palette's display-mode pattern**, an app-level mode with a remount. There's no new component and no in-palette mode switch, because `CommandPalette` owns the query. Using TaskPicker's order and words keeps the two choosers consistent. Both commands are optional and never suggested (calm optional controls).
7. **Order.**
   - #587 lands first, alone.
   - Then #574, #575 and #581 run in parallel.
   - #580 goes last. It changes `task-card.tsx` (as #575 does) and `BoardCard.tsx` and `InboxPage.tsx` (which #574 touches).
   - The design system is republished from main after #575 and after #580.
8. **The owner's Board checklist:** no findings were given at the start of this run ("none yet"). Findings that arrive later become issues.

9. **A card with no estimate and nothing done draws no dots row** (#575, PR #594).
10. **Decision 1 amended** (#634, PR #635): main runs share one group per ref, with cancel-in-progress only on PRs, so a running main run always finishes and only the newest pending one is kept. One group per SHA queued 38 runs on the 5 macOS runners.

## Open questions
None.

## Implementation status
Implemented (2026-11-16). Plan: [2026-11-15-board-polish](../plans/2026-11-15-board-polish.md). Merged PRs:
- #590 CI (#587); #635 main concurrency (#634); #625 Windows design-system paths (#611).
- #591 (#574), #594 (#575), #619 (#580), #592 (#581).
- #630 PopoverMenu beside (#624); #626 (#612); #631 (#628); #641 (#636); #623 (#618 flake); #637 (#633 flake).

### Follow-ups
- #624, #628, #636: done (#630, #631, #641).
- #638: Settings presets focus gives up after about 10 timer ticks.
- #643: Sheet Alt+Tab path, Alt+Tab wrap and the flaky `tab_walk_keeps_ring`.
- #646: Board drag slot opening motion and the Moving card's height.
