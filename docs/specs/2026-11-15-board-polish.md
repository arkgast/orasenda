# Board polish: GitHub CI, shared single-key setting, rows and the palette's task (P2) — Spec

- **Status:** approved (autonomous run, owner 2026-11-15: "go autonomous until you finish"; a fable review stood in for the owner gate, and its findings are applied below)
- **Date:** 2026-11-15
- **Issues:** #587, #574, #575, #579, #580, #581 (follow-ups of the Board, epic #545)
- **Follows:** [the Board spec](2026-11-14-board.md)

## TL;DR
Six small follow-ups to the Board, done before task import. First, GitHub CI completes green on `main` again (#587). Then five Board follow-ups: one shared single-key hook (#574), clamped card titles (#575), more layout cases for the task sheet (#579), rows that are one tab stop and open their menu from the keyboard (#580), and palette commands that choose or clear the session's task (#581).

## Change in a nutshell
- **CI (#587).**
  - The required `ci` check becomes a summary job. It needs a `checks` job (everything in `./scripts/ci.sh`, with the WebKit layout run skipped) and a 4-way sharded `layout` job.
  - A run on `main` is never cancelled.
  - The Windows advisory `guard.test.ts` normalises paths before matching them.
- **Single keys (#574).** `useSingleKeySetting(): { on, failed }` moves to `@domain/keyboard`. Board, Inbox and Routines import it, and the two `useSingleKeyOn` copies go away. This is a move, not a behaviour change.
- **TaskCard (#575).** In `density="card"` the title shows at most 3 lines, with an ellipsis. The full title stays in the accessible name. A new long-title card is checked at 640×480. The `board.spec.ts` guard below 600 px stays, with an accurate comment: it is about a full card, not the title (Decision 11).
- **Task sheet (#579).**
  - New layout cases cover a full task (8 tags, 12 or more checklist items), a failed save and the empty-title error, each at three sizes.
  - The shared `smallTargets` helper measures a checkbox by its label and a control with a `::before` hit area by that area, so callers stop filtering them out.
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
- **The macOS `ci` job times out.**
  - It runs every WebKit layout case on one worker: 3,312 tests across 3 projects.
  - On a22e49b8 it started layout at 12:19:44, after under 3 minutes of other checks. It had run about 2,900 tests when it hit `timeout-minutes: 45` (run 43712919941).
  - Earlier main runs were cancelled by the next push (`.github/workflows/ci.yml:11-13`, one group per ref with `cancel-in-progress: true`).
  - So `main` hasn't had a green GitHub run since the Board and Routines merges.
- **The Windows advisory job fails at `ui (tests)`** (`justfile:121`), and has done since H.
  - The test is `packages/ui/guard.test.ts › source_critical_only_in_dialog_destructive_and_button_critical`.
  - It tests the `allowed` regex against raw paths (`:72-74`), strips `${dir}/` (`:76`), then filters `^(types|index)` (`:78`). All three assume `/` separators. Lines `:44` and `:49` strip paths the same way.
  - Because the job dies there, no later step has run on Windows since H.
- **The same settings-reading hook exists three times:** `features/board/useSingleKeyOn.ts:9`, `features/inbox/useSingleKeyOn.ts:9` and `features/routines/useRunKeys.ts:16-42`. conventions.md (`docs/conventions.md:67`) puts code two features share in `domain/`. No test covers any of the three.
- **A long title can make a card taller than its column.**
  - `board.spec.ts:52-54` also skips a focus-ring check below 600 px high.
  - A fable probe showed that this skip isn't about the title. At 640×480 the "Write the intro" card is 236 px tall, with a one-line title, against a 202 px scrollport. The height comes from its Frog and priority row, dots, meta, due date and two tags (`scenarios/boardData.ts:55-62`).
- **The task sheet's layout cases are thin.**
  - They don't cover its densest content or its error lines.
  - Its spec filters checklist checkboxes and tag remove marks out of the hit-target check (`boardDetail.spec.ts:62-64`; also `captureWindow.spec.ts:50-52`). The helper (`verification/layout/support/hitTargets.ts:7-34`) measures only the element box, but these controls get their size from a label or a `::before` (`tag-field.tsx:94`).
- **Roving rows still put every More button in the Tab order.** Under macOS Full Keyboard Access or WebView2, Tab walks every one.
- **Short windows can't show the TaskPicker.** Below 480 px high, Today's stacked strip and short ring hide it (`Today.tsx:350`), so a task can't be picked, seen or cleared there.

## Goals / Success criteria
1. The first push to `main` after #587 merges gets a green GitHub `ci` check, with no job over 25 minutes. The required context is still `ci`.
2. Locally, `./scripts/ci.sh` (and so `baton verify`) still runs every check, layout included.
3. `guard.test.ts` passes on Windows. Steps after `ui (tests)` will run there for the first time since H. A later step that fails gets its own issue (Decision 4).
4. `useSingleKeyOn` exists nowhere. Board, Inbox and Routines all use `@domain/keyboard/useSingleKeySetting`. Their existing tests pass with only import changes, and the hook has its own tests.
5. At 640×480, a card with a 300-character title has its box inside its column's scrollport, and its focus ring is visible. The guard at `board.spec.ts:52-54` stays, its comment is reworded to the real cause, and a follow-up issue covers a full card at 640×480 (Decision 11).
6. `boardDetail.spec.ts` covers the three new states at 1440×900, 900×600 and 640×480. The filters at `boardDetail.spec.ts:62-64`, and the `input ""` part of `captureWindow.spec.ts:51`, are removed. Every control passes `smallTargets`.
7. On Inbox and Board:
   - Tab from a row leaves the list.
   - ⇧F10 and ContextMenu open the focused row's menu.
   - With `keys.single_key` off, every menu action, Move to Board included, still works from the keyboard.
8. At any size of the main window, the palette can choose a task for the session or clear it.

## Non-goals
- Faster or fewer layout cases, and fewer projects (light, dark, reduced motion). See Decision 1.
- Windows layout runs. Playwright WebKit stays macOS only.
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

### CI (`.github/workflows/ci.yml`, `justfile`)
- **`layout` recipe** (`justfile:150-161`) becomes `layout *args:`, and `{{ args }}` is passed through to `playwright test`.
  - With `ORASENDA_LAYOUT=skip` set and no args, it prints `layout: skipped (ORASENDA_LAYOUT=skip; the layout job runs it)` and exits 0, before the WebKit check.
  - `ci` keeps calling `just layout` unchanged.
  - A new `scripts/layout-skip.test.sh` runs `ORASENDA_LAYOUT=skip just layout` with a stub `pnpm` first on `PATH` that fails if called. It asserts the line and exit 0. It is registered in `ci` beside `docs-only.test.sh` (`justfile:88`).
- **Job `checks`** (name `checks`, macos-26, `timeout-minutes: 25`).
  - It keeps today's steps except the Playwright version, cache and WebKit install (`ci.yml:105-120`). It keeps `pnpm install --frozen-lockfile`.
  - It runs `./scripts/ci.sh` with `env: ORASENDA_LAYOUT: skip`.
  - The docs-only gitleaks step stays here.
- **Job `layout`** (name `layout (${{ matrix.shard }}/4)`).
  - Runs on macos-26, with `timeout-minutes: 25`, `strategy.fail-fast: false` and `matrix.shard: [1, 2, 3, 4]`.
  - Its steps, in order:
    1. checkout (`fetch-depth: 0`, `persist-credentials: false`);
    2. the docs-only decision;
    3. pnpm;
    4. node;
    5. Install just (the same release download);
    6. Read the Playwright version;
    7. the Playwright cache;
    8. `pnpm install --frozen-lockfile` and `pnpm exec playwright install webkit`;
    9. `just layout --shard=${{ matrix.shard }}/4`.
  - It has no Rust, Python or gitleaks steps, and no build: `@orasenda/ui` exports source (`packages/ui/package.json:7-10`) and the tokens CSS is committed.
  - Every step after the docs-only decision is skipped on docs-only changes, so the job passes.
- **Job `ci`** (name `ci`, the required context).
  - Runs on ubuntu-latest, with `needs: [checks, layout]` and `if: always()`. It must be `always()`: never `!cancelled()` or no `if`, because a skipped required job counts as passing.
  - Its one step fails unless `needs.checks.result == 'success'` and `needs.layout.result == 'success'`. A matrix result is `success` only when every shard passed.
- **Concurrency:**
  - `group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`
  - `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`
  - Each push to main gets its own group, so no main run is cancelled or dropped while pending.
- **Windows** stays advisory. It keeps running `./scripts/ci.sh`, where layout already skips itself off macOS.
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

### Layout support (`verification/layout/support/hitTargets.ts`)
`smallTargets` measures the larger of two boxes: the element's own box, and the box it gets its hit size from.
- **A checkbox or radio:** the box of its wrapping `<label>`, or the label linked to it by `for`.
- **A control with a positioned `::before`:** the pseudo-element's computed `width` and `height`, centred on the element (as `tag-field.tsx:94` uses `before:size-hit-min`).

Boxes can only grow, so no current caller's result gets worse. The filters at `boardDetail.spec.ts:62-64`, and the `input ""` part of `captureWindow.spec.ts:51`, are removed.

### Layout scenarios
- **#575** adds `scenarios/boardLongTitle.ts`: one Today task with a 300-character title and no estimate, tags, due date, priority or checklist. "Write the intro" stays as it is, because `board.spec.ts:50-54` and `boardDetail.spec.ts:15` use that name.
- **#579** adds `scenarios/boardSheet.ts`:
  - `boardFullTask`: 8 tags, 14 checklist items and long notes;
  - `boardSaveFails`: `task_update` rejects.
- Each task appends one line to `scenarios/index.ts` and its count to `scenarios.test.ts`. On conflict, keep both sides.
- The empty-title error copy is the sheet's existing line, "A task needs a title. Still using …" (`TaskSheet.test.tsx:95`).

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
- **CI:**
  - A failure in any shard fails `ci`, and so does a cancelled `checks` job.
  - On docs-only changes, all three jobs pass quickly.
  - Each shard starts its own vite servers. `reuseExistingServer` is false under CI (`playwright.config.ts:21-32`).
  - Shards split by file group, not evenly. If a shard goes over 20 minutes, raise the shard count, not the timeout.
  - CI keeps `retries: 1`.
  - Four shards plus `checks` is five macOS jobs per run, so two PR runs at once will queue. That is accepted.
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
  - `scripts/layout-skip.test.sh`, in `ci`.
  - The yaml is reviewed, and proven by the PR's own GitHub run: four layout shards, `checks` and `ci` all green.
  - #587 is done when the first `main` run after the merge is green.
- **guard.test:** the seeded `rel` assertion.
- **#574:** `useSingleKeySetting.test.ts`, with the four cases above. The existing Board, Inbox and RunView tests stay green.
- **#575:**
  - In vitest: a long title keeps the full accessible name, in both the button form and the read-only form.
  - In `board.spec.ts`: the `boardLongTitle` case at 640×480, where the card fits its column and its focus ring is visible.
  - The 600 px guard stays, with the reworded comment.
- **#579:**
  - In `boardDetail.spec.ts`: `boardFullTask`, `boardSaveFails` and the empty-title error, at three sizes. Each case checks no scroll outside the sheet body, `smallTargets` empty, and a visible focus ring.
  - A new `verification/layout/hitTargets.spec.ts` covers label-measured and pseudo-element targets on a fixture page.
- **#580:**
  - In vitest, for both components:
    - Tab from a row leaves the list.
    - ⇧F10 and ContextMenu open the menu with focus on its first item.
    - Esc returns focus to the row after a key-opened menu, and to the More button after a click-opened one.
    - The `contextmenu` default is prevented after ⇧F10.
  - The Inbox page test: with single keys off, ⇧F10 → *Move to Board* works.
  - The keyboard cases in the Inbox and Board layout specs are updated.
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
1. **CI: shard the layout run 4 ways and keep `ci` as a summary job.**
   - Raising the timeout alone grows with every new spec, and each run would take about 60 minutes.
   - Trimming projects would drop the dark and reduced-motion checks that the UI rules require.
   - Sharding keeps every case. It comes to about 12 minutes of tests per shard (fable check of the timings), plus about 3 minutes of setup.
   - Branch protection already requires the `ci` context (strict), so its settings don't change.
2. **Main runs are never cancelled or dropped.** Each SHA gets its own group, because with one group per ref GitHub would still drop a pending run when a third push came. PR runs still cancel older runs on the same branch.
3. **Local verify is unchanged.** Only the GitHub `checks` job sets `ORASENDA_LAYOUT=skip`, and the switch lives in the `layout` recipe, so `ci` doesn't recurse.
4. **The Windows fix is limited to guard.test's paths.** A later Windows step that then fails gets its own issue and doesn't block #587, which is about macOS.
5. **#574 is a mechanical move.**
   - The domain hook is Routines' version, with `failed`, as the issue asks.
   - Board and Inbox don't start showing a failure line. That would be a behaviour change; file it if it's wanted.
   - In Routines code, only `RunView.tsx` (the import) and `useRunKeys.ts` (the export removed) change.
6. **The clamp is 3 lines**, as the issue suggests. The sheet shows the full title, so there's no tooltip.
7. **#580 uses ⇧F10 and the ContextMenu key, the Windows and web convention.**
   - macOS has no ContextMenu key, and F10 needs Fn on laptop keyboards.
   - So the More button names ⇧F10 in its tooltip and `aria-keyshortcuts`.
   - Rows get no single-key menu key, so `keys.single_key` isn't involved.
   - Focus returns to where the menu was opened from.
8. **#581 reuses the palette's display-mode pattern**, an app-level mode with a remount. There's no new component and no in-palette mode switch, because `CommandPalette` owns the query. Using TaskPicker's order and words keeps the two choosers consistent. Both commands are optional and never suggested (calm optional controls).
9. **Order.**
   - #587 lands first, alone.
   - Then #574, #575, #579 and #581 run in parallel. Their only shared files are append-only: `scenarios/index.ts` and `scenarios.test.ts`.
   - #580 goes last. It changes `task-card.tsx` (as #575 does) and `BoardCard.tsx` and `InboxPage.tsx` (which #574 touches).
   - The design system is republished from main after #575 and after #580.
10. **The owner's Board checklist:** no findings were given at the start of this run ("none yet"). Findings that arrive later become issues.

11. **The 640×480 guard in `board.spec.ts` stays** (fable plan review). A full card is taller than the 202 px Today column at 640×480 because of its metadata, not its title. Making it fit means a layout decision about the column, not a fix inside the title. It gets a follow-up issue, and the long-title card judges the clamp.

## FAQ
### Why a summary job rather than making `layout` the required check?
Branch protection names one context, `ci`. A summary job keeps that name and lets the work split freely. Renaming the context would mean editing protection, and would leave PRs opened before the change pending forever.

### Why not run more Playwright workers on one runner?
The macos-26 runner has 3 vCPUs, and one WebKit worker plus two vite servers already load it. Locally under load, extra workers caused layout timeouts (Board session). Shards give real parallelism.

## Open questions
None.

## Implementation status
Not started.
