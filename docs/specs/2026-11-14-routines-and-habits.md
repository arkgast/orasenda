# Routines and habits (P4, first part) — Spec

- Status: approved (owner, 2026-11-14: "go autonomous until you finish"; every ruling below is the controller's, recorded under Decisions, and the owner can overrule it later)
- Date: 2026-11-14
- Owner: Arnold Gandarillas Castillo
- Related:
  - Product: [SPEC 2.4](../SPEC.md#24-routines-and-habits-one-module), principles (SPEC 1), data model (`Habit → HabitCheck`, `Routine → RoutineRun`, SPEC 4), SPEC 3 (warm sand for routines, motion, VoiceOver).
  - Roadmap: [P4](../ROADMAP.md#phases). This spec covers routines, habits, the tracker, the five templates and the due nudge. Weekly review, the daily shutdown flow (SPEC 2.5) and stats stay in P4 but get their own specs later.
  - Components: `HabitDots`, `RoutineItem`, `WellnessNote`, `PageFrame`, `EmptyState`, `Dialog`, `Input`, `TextArea`, `Button`, `PopoverMenu`, `InlineNotice`, `Kbd`, `SettingsRow`.
  - ADRs: ADR-002 (syncable entities and `change_log`), ADR-011 (time is worded in Rust), ADR-012 (store API), ADR-013 (one Rust state, many surfaces), ADR-014 (settings), ADR-015 (code-first design system), ADR-021 (frontend layers).
  - Pattern to copy: the Inbox slice (spec F): `crates/store/src/repo/inbox_notes.rs`, `crates/service/src/inbox/`, `apps/orasenda/src-tauri/src/commands/inbox.rs`, `apps/orasenda/src/features/inbox/`.
  - Runs in parallel with the Board session (P2). See [Working beside the Board session](#working-beside-the-board-session).

## TL;DR
- **Routines page.** The rail's Routines placeholder becomes a real page: the person's routines, each with its steps and today's progress in words, their standalone habits with a check-in, and a calm dot grid for each habit.
- **Habits** carry the four SPEC 2.4 fields: the implementation intention (*I will X at T in P*), the anchor (*After X, I will Y*), the 2-minute version and the identity statement. Each field is optional except the name. Rust words the sentences.
- **Routines** are ordered habits at an optional time of day, on chosen weekdays. **Start** runs one step by step. Every step can be done from the keyboard: Enter for *Done*, S for *Skip for today*, Esc to end. A `routine_run` row records the run.
- **Tracker.** One dot per day for the last 28 days, in words and shapes. A single miss never breaks a run. Two scheduled days missed in a row show one kind line: "Two days off. Today is a fresh start." Nothing is red and nothing is called *missed*, *broken* or *lost*.
- **Five starter templates** (Morning Light & Movement, Deep Work Start, Study Session, Evening Shutdown, Wind-down). Adding one copies it into an ordinary, editable routine with the "Wellness suggestion, not medical advice." note. Evening Shutdown is a plain routine for now; its SPEC 2.5 flow comes later (follow-up).
- **Due nudge.** *When a routine is due* in Settings › Notifications, off by default. When it is on and macOS allows it, Orasenda posts one local notification at a routine's time, once per routine per day, and never after the routine is done.
- **Four new syncable tables** in one migration: `routine`, `habit`, `habit_check` and `routine_run`.

## Change in a nutshell
1. Press ⌘4 (the Board session owns the key; it already opens Routines). The page says "No routines yet." and offers **Start from a template** and **Make your own**.
2. Choose *Start from a template*, then *Morning Light & Movement*. A routine appears with five steps, the time 07:00, *Every day*, and the wellness note.
3. At 07:00 nothing happens, because the nudge is off. Turn on Settings › Notifications › *When a routine is due*, and the next morning a notification says "Morning Light & Movement is ready when you are."
4. Press **Start**. The run view shows "Step 1 of 5", *Drink a glass of water*, its 2-minute version and identity line, and a **Done** button. Press Enter four times and S once. "Routine finished. 4 of 5 done today." The page returns, and the card says "Done today, 4 of 5".
5. Under each habit, today's dot is solid with a ring. The dot for the skipped one stays an upcoming square until midnight and then becomes hollow ("Not done"). A one-day gap keeps the run.

## Problem
SPEC 2.4 promises one module for routines and habits, grounded in implementation intentions, anchoring, 2-minute versions and identity. P1 ships the focus timer, and the rail already lists Routines, but the page is a placeholder. The ADHD audience needs a start that takes almost no effort (one key per step), a record that never shames, and routines they can edit rather than accept.

## Goals / Success criteria
1. A person can create, edit, reorder and remove routines and habits, by keyboard alone and with VoiceOver.
2. A person can add any of the five templates, then edit it like any other routine. Each templated routine shows the wellness note.
3. A routine runs step by step with Enter, S and Esc, and a `routine_run` row records it, including an ended-early run.
4. Checking a habit in, from a run or from the page, writes one `habit_check` for today's local date. Unchecking tombstones it.
5. The dot grid shows the last 28 local days in shape and words. The run rule (one miss forgiven, two in a row restart) holds in core unit tests.
6. The due nudge is off by default. It posts only when the preference is on and the status is `granted`, at most once per routine per local day.
7. Both themes pass `just contrast`, and every new component has a README, a component test and a specimen in both themes.
8. `./scripts/ci.sh` is green, and every file stays at 500 lines or fewer.

## Non-goals
- The daily shutdown flow, weekly review and plan, and neutral stats (rest of P4). Follow-ups are filed.
- Linking a routine step to a Board task. "Set the Frog and 3 priorities" is a plain step.
- Starting a blocking profile from a step (P6). The Deep Work Start step is plain text.
- Sound, NSDR audio or a brief-rest cue (P8).
- Onboarding's "Morning template" step (P3 onboarding).
- Opening the run from the notification, or notification actions (a follow-up).
- A routine on the menu-bar item, the floater or full screen.
- A template gallery or sharing (P10).

## Users & permissions
One local person. There are no accounts. The nudge uses the existing notification permission and asks for nothing new. Routine data is syncable (ADR-002); nothing is sent anywhere.

## Domain model
New CONTEXT.md terms:

| Term | Meaning | Not to be confused with |
|---|---|---|
| Habit | A recurring action with a name and the optional intention (*when*, *where*), anchor, 2-minute version and identity statement. It sits in one routine or stands alone. Syncable (`habit`). | A step (a habit as it appears inside a run) |
| Routine | An ordered list of habits with an optional time of day and the weekdays it runs. Syncable (`routine`). | A template (the starting copy) |
| Template | One of the five built-in starter routines, kept in core as data. Adding one copies it into a new routine; the copy remembers the template's id only to show the wellness note. | A routine |
| Check-in | A `habit_check` row: this habit was done on this local date. Removing it tombstones the row. | A run (a check-in can happen outside a run) |
| Run | One pass through a routine, step by step: a `routine_run` row with its start, end, outcome (`finished` or `stopped`) and counts. | A focus session |
| Step | One habit inside a run: *upcoming*, *done* or *skipped*. | A habit |
| Scheduled day | A local date on which a habit is expected: in its routine's weekdays, or in the standalone habit's own weekdays, and on or after the day it was created. | Any day |
| Dot grid | The last 28 local days of one habit in `HabitDots`, oldest first. | A streak counter |
| Run of days | The current count of done scheduled days, where a single not-done scheduled day between two done days is forgiven. Two not-done scheduled days in a row end it. | A streak that breaks on one miss |
| Fresh-start line | "Two days off. Today is a fresh start." It shows while the two latest scheduled days before today are both not done and today is not done yet. | A warning (Orasenda has none) |
| Due nudge | The one local notification at a routine's time of day, gated by `notify.routine_due` and the notification status. | A reminder list |

### Tables (migration `0007_routines.sql`, syncable, `change_log` like `inbox_note`)
- **`routine`:** `id` TEXT PK (UUIDv7), `name` TEXT 1–80 characters, `time_of_day` INTEGER NULL (0–1439 minutes after local midnight), `days` INTEGER NOT NULL (weekday mask, Monday = 1 … Sunday = 64, 1–127, default 127), `template` TEXT NULL (template id), `position` INTEGER NOT NULL, `created_at`, `updated_at` INTEGER NOT NULL, `deleted_at` INTEGER NULL.
- **`habit`:** `id` TEXT PK, `routine_id` TEXT NULL (references `routine`; NULL means standalone), `position` INTEGER NOT NULL (within its routine, or among the standalone habits), `name` TEXT 1–80, `when_text`, `where_text` TEXT NULL ≤ 80, `anchor`, `two_minute`, `identity` TEXT NULL ≤ 120, `optional` INTEGER 0/1, `days` INTEGER NULL (standalone only; 1–127), `created_at`, `updated_at`, `deleted_at`.
- **`habit_check`:** `id` TEXT PK (`<habit_id>:<YYYY-MM-DD>`, so two devices that check in on the same day agree), `habit_id` TEXT NOT NULL, `day` TEXT NOT NULL (`YYYY-MM-DD`, local), `checked_at` INTEGER NOT NULL, `deleted_at` INTEGER NULL. Checking in again clears `deleted_at`.
- **`routine_run`:** `id` TEXT PK (UUIDv7), `routine_id` TEXT NOT NULL, `day` TEXT NOT NULL, `started_at` INTEGER NOT NULL, `ended_at` INTEGER NULL, `outcome` TEXT NULL (`finished` | `stopped`; NULL while running), `steps_total`, `steps_done`, `steps_skipped` INTEGER NOT NULL, `step_ids` TEXT NOT NULL (the habit ids in run order, as JSON, frozen at start so edits never change a running run), `updated_at`.
- `Entity` gains `Routine`, `Habit`, `HabitCheck` and `RoutineRun`. Limits: 30 live routines, 20 live habits per routine and 30 standalone habits (the service refuses with `Full`).

## Interfaces

### Core (`crates/core/src/routines/`, pure, time passed in)
- `LocalDate` (year, month, day) with `from_epoch_ms(ms, offset_min)`, `weekday()`, `pred()`, `succ()`, `to_iso()` and `parse_iso()`.
- `Weekdays(u8)` mask: `EVERY_DAY`, `WEEKDAYS`, `contains(weekday)`, and `label()` → "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri". The service words labels through core helpers (ADR-011).
- `tracker::day_states(created: LocalDate, today: LocalDate, days: Weekdays, done: &BTreeSet<LocalDate>, window: u16) -> Vec<DayDot>`. `DayDot { date, state: Done | NotDone | Rest | Upcoming, today: bool }`. Days before `created` are left out. A checked day is `Done`, even a rest day. Today, when not checked, is `Upcoming` on a scheduled day and `Rest` on an off day (Decision 15).
- `tracker::run_of_days(...) -> u16` and `tracker::fresh_start(...) -> bool`, per the rules under Domain model. Only scheduled days count, and today never breaks a run.
- `templates::all() -> &'static [Template]` and `templates::get(TemplateId)`. A `Template` has an `id` (`TemplateId`), `name`, `time_of_day`, `days`, `summary`, `note` (the wellness note) and steps; each step has a `name`, an optional `two_minute`, `identity`, `anchor` and `detail`, and `optional`. All five carry `wellness: true`. The copy is under [Templates](#templates).
- `due::due_now(time_of_day, days, today_weekday, local_minute, finished_today, nudged_today) -> bool`. True from the minute of `time_of_day` up to 30 minutes after it (clipped at local midnight), on a scheduled weekday, and only while the routine is neither finished nor already nudged today.

### Store (`crates/store/src/repo/routines/`)
Repositories `routines`, `habits`, `habit_checks` and `routine_runs`, each with a module doc that says **Syncable**. Every write logs its fields to `change_log`. No `rusqlite` type appears in the public API. Removal is a tombstone, and removing a routine also tombstones its habits in the same transaction. `list_live` orders by `position`, then `id`. `checks_since(habit_ids, from_day)` returns the live checks. `open_run(routine_id)` returns the running run, if any.

### Service and IPC (`crates/service/src/routines/`, commands in `apps/orasenda/src-tauri/src/commands/routines.rs`)
Types (`crates/service/src/api/routines.rs`, `specta`, camelCase):
- `RoutinesView { routines: Vec<RoutineView>, habits: Vec<HabitView> /* standalone */, run: Option<RunView> /* the open run */ }`.
- `RoutineView { id, name, timeOfDay: Option<u16>, time: Option<String> /* "07:00" or "7:00 AM" by hour cycle */, days: u8, daysLabel: String, wellness: bool, habits: Vec<HabitView>, today: RoutineToday, todayLine: String }`. `RoutineToday` is `notStarted | inProgress | finished`. `todayLine` reads "Not started today", "2 of 5 done today" or "Done today, 4 of 5".
- `HabitView { id, routineId: Option<String>, name, whenText, whereText, anchor, twoMinute, identity: Option<String>, optional: bool, days: Option<u8>, daysLabel: Option<String>, intention: String /* "I will drink a glass of water at 7:00 in the kitchen." */, anchorLine: Option<String> /* "After I wake up, I will drink a glass of water." */, dots: Vec<HabitDotView>, doneToday: bool, runLine: Option<String> /* "5 days kept" when 2 or more */, freshStart: Option<String> }`. Rust words every sentence; the webview never assembles one.
- `HabitDotView { state: HabitDayState /* done | notDone | rest | upcoming */, today: bool, label: String /* "Monday 9 November" */ }`.
- `RunView { id, routineId, routineName, steps: Vec<RunStepView>, current: Option<u16> /* index; None when every step is answered */, done: u16, skipped: u16, total: u16, wellness: bool, line: String /* "Step 2 of 5" or "Routine finished. 4 of 5 done today." */ }`. `RunStepView { habitId, name, detail: Vec<String> /* intention, anchorLine, "2-minute version: …", identity */, optional: bool, state: StepState /* upcoming | done | skipped */ }`.
- `RoutineDraft { name, timeOfDay: Option<u16>, days: u8 }`; `HabitDraft { name, whenText, whereText, anchor, twoMinute, identity: Option<String>, optional: bool, days: Option<u8> }`. The service trims the text, and an empty string becomes `None`.
- `TemplateView { id: TemplateId, name, summary, time: Option<String>, steps: Vec<String> }`. `TemplateId` is `morningLight | deepWorkStart | studySession | eveningShutdown | windDown`.
- `RoutinesError { NotFound, Empty, TooLong, Full, Running, Store }`.
- Commands (all `main`-window only, in `build.rs` `AppManifest` and `capabilities/main.json`): `routines_list`, `routine_templates`, `routine_create(draft) → id`, `routine_add_template(template) → id`, `routine_update(id, draft)`, `routine_move(id, toIndex)`, `routine_remove(id)`, `routine_restore(id)`, `habit_create(routineId: Option, draft) → id`, `habit_update(id, draft)`, `habit_move(id, toIndex)`, `habit_remove(id)`, `habit_restore(id)`, `habit_check(id, done)`, `run_start(routineId) → RunView`, `run_step(runId, outcome: Done | Skip) → RunView`, `run_end(runId) → RunView`.
- Event `routines-changed` with `RoutinesView`, emitted after every committed write, outside the service lock (like `inbox-changed`). `Host` gains `emit_routines_changed`.
- Run rules: `run_start` refuses with `Running` while another run is open today. An open run from an earlier day is closed as `stopped` the first time the routines are read on a new day. `Done` checks the step's habit in for today (idempotent). `Skip` writes nothing but the run's counts. Answering the last step ends the run as `finished`. `run_end` ends it as `stopped`. A step whose habit was removed during the run reads as *skipped*.
- **Settings:** `notify.routine_due` (bool, default false), `Settings.notifyRoutineDue`. `settingsQueue.ts`'s key list, the TS fixtures and `layoutMain.tsx` follow it.
- **Nudge:** the scheduler calls `routines::nudge_due(host)` once per new local minute. It reads the live routines with a time, asks core `due_now` for each, and posts "<Routine name> is ready when you are." through the existing `Notifier`, only when `notify.routine_due` is on and the status is `granted` (read before posting). Routines already nudged are held in memory as a `(routine id, local date)` set, so a relaunch inside the 30-minute grace window can nudge once more; that is accepted.

### Routines page (`apps/orasenda/src/features/routines/`)
- Replaces the `Placeholder` for `routines` in `App.tsx`: one line in the page switch, no change to the page list, keys or `NavRail` (Board session).
- `useRoutines` holds the view from `routines_list` and `routines-changed`. Writes are chained: one call in flight, as in the conventions' *Newest wins* rule.
- **Overview** (the canvas's chosen option, see Decisions): the `PageFrame` title "Routines". The page's one primary action is **Start** on the next routine due today (or the first not finished today); every other Start is a secondary button. Each routine is a `RoutineCard`: name, time and days, the today line with its shape, the steps as read-only `RoutineItem`s, and a *More* `PopoverMenu` (Edit, Move up, Move down, Remove). The *Habits* section lists the standalone habits, each with a "Done today" `RoutineItem` checkbox and its `HabitDots`. *Show the record* on a routine expands each step's `HabitDots` (28 days, legend once per page). `WellnessNote` sits at the foot of every templated routine.
- **Empty state:** `EmptyState` "No routines yet." with the message "Routines are small steps you take at the same time each day." The primary action is **Start from a template**; the secondary is **Make your own**.
- **Add:** an *Add* menu (New routine, From a template…, New habit). *From a template…* opens a `Dialog` with the five templates as a list of choices: name, summary, steps and the wellness note.
- **Editors:** a `Dialog` for a routine (name, time of day as an `Input` of type time or *Any time*, `DayPicker`) and for a habit (name, when, where, anchor, 2-minute version, identity, *Optional*; a live preview of Rust's sentence after save). Errors appear inline under the field (`Input` error). Remove shows an `InlineNotice` row: "Removed Morning Light & Movement." with **Undo**, for 10 seconds or until the next action.
- **Run view:** same page and route; the overview is replaced while a run is open. The `RoutineStep` component shows the routine name (`h1`), "Step 2 of 5", the step name, its detail lines, the progress list (shape and word per step), **Done** (primary, Enter), **Skip for today** (S), and **End routine** (Esc). S and the Enter fallback honour `keys.single_key` (WCAG 2.1.4): with single keys off, only the buttons work. Focus moves to the step name after each answer. One polite live region says the new step. At the end, "Routine finished. 4 of 5 done today." with **Back to routines** (focused), then the overview.
- **Settings › Notifications:** a `SettingsRow` *When a routine is due* under the existing rows, wired like *Tell me when a session ends*: the same permission flow, the same denied line.

### Design-system components (`packages/ui`, code-first, ADR-015)
Each new or changed component has its `.tsx`, its `<kebab>.md` README, a component test and a specimen in both themes. They use the closed theme only (no arbitrary values), and `designSystem.test.ts` counts follow.
- **`RoutineCard`** (new): `name`, `meta` ("07:00 · Every day"), `today` (`notStarted | inProgress | finished` drawn as shape + word: hollow ring, half-filled ring, filled check), `todayLine`, `children` (the steps), `actions` slot, `footer` slot (the wellness note). Uses `routine` (warm sand) as an accent on the edge only, never as the only signal. It is an `article` with `aria-labelledby` pointing at its name.
- **`RoutineStep`** (new): the run view's body: `routineName`, `progressLine`, `step { name, detail[], optional }`, `steps[]` (name and `upcoming | done | skipped` as shape + word), `actions` slot, `finished` with `finishedLine`. The step name is the focus target (`tabIndex=-1`); the progress list is an ordered list, and the current step has `aria-current="step"`.
- **`DayPicker`** (new): seven toggle buttons (`aria-pressed`) in a `group` named by `label`, each with its short letter shown and its full weekday name for VoiceOver, plus `value: number` (mask) and `onChange`. At least one day stays on: the last pressed day can't be turned off, and the component says so in its helper line. The hit targets come from the README.
- **`HabitDots`** (changed): `runLine` (shown under the grid in `ink-muted`) and `weeks` layout (`columns="week"`: rows of seven aligned to Monday, so the same weekday stacks). The existing `restartNote` is the fresh-start line. Its README gains both.

### Templates
Each template's steps are listed in order, with the 2-minute version in parentheses. Steps marked *Optional* get `optional: true`.
1. **Morning Light & Movement** (07:00, every day). Summary: "Water, daylight and movement to start the day." Inspired by Huberman Lab.
   1. Drink a glass of water (one sip).
   2. Get outdoor light: 5–10 min, 15–20 if overcast, 30+ if heavily overcast (step outside the door).
   3. Move for 5–10 minutes (ten squats).
   4. Set the Frog and 3 priorities (write the Frog).
   5. Delay caffeine 90–120 minutes (*Optional*; the detail says "The evidence is contested.").
   6. Electrolytes (*Optional*).
   7. Visual focus drill, 30–60 seconds (*Optional*; the detail says "Weak evidence.").
2. **Deep Work Start** (09:00, weekdays). Summary: "Clear the way before deep work." Steps: Clear the desk; Put the phone in another room; Close chat; Write what this block is for; Turn on your blocker or Do Not Disturb (Orasenda's blocking comes later).
3. **Study Session** (any time, weekdays). Summary: "Learn by recalling, not re-reading." Steps: Test yourself: recall before you re-read; Brief rest between rounds (*Optional*); NSDR afterwards (*Optional*; the detail says "Non-sleep deep rest. Experimental.").
4. **Evening Shutdown** (17:30, weekdays). Summary: "Close the workday on purpose." Steps: Move unfinished tasks; Preview tomorrow; Reflect: what went well, what to improve, what was outside your control; Say "Shutdown complete". (The SPEC 2.5 flow is a follow-up.)
5. **Wind-down** (21:30, every day). Summary: "Dim the evening and set a screen cutoff." Steps: Dim the lights and avoid bright overhead light; Set a no-screens cutoff.

Identity lines are left empty in templates; the person writes their own. Every template routine shows `WellnessNote`. The Morning Light one reads "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence."

## Behavior & edge cases
- **Day boundary.** All dates are local and computed in Rust from `LocalTime` at the moment of the call. `routines-changed` is also emitted once at local midnight, so the grid and the today lines roll over without a reload.
- **Time zone change.** A check-in keeps the date it was made on. The grid uses the current offset.
- **Routine edited during a run.** The run keeps the step order frozen at start. Renaming a habit shows the new name. A removed habit's step reads *skipped*.
- **Routine removed during a run.** The run ends as `stopped`, and the run view returns to the overview with the Undo row.
- **Store unavailable.** The page shows one plain failure line in its slot ("Routines can't be read right now. Your data is safe; try again in a moment.") and a **Try again** button. Writes that fail roll back to the last view Rust sent and show the line. Nothing fails silently.
- **Two windows.** Only the main window shows Routines; the event keeps it current.
- **Reduce motion.** The step change cross-fades (`duration-calm`) only without reduce-motion; with reduce-motion it changes at once.
- **Copy.** Plain and kind: no exclamation marks, no emoji, never *missed*, *failed*, *broken* or *streak lost*.

## Data & migrations
- `0007_routines.sql` adds the four tables with their CHECKs and an index on `habit_check(habit_id, day)`. `SCHEMA_VERSION` becomes 7, and the fresh-schema table count goes up by four.
- **Migration order.** The Board session adds its own migration. Whoever lands second renumbers to the next free number while rebasing and fixes `SCHEMA_VERSION` (owner rule, 2026-11-14).
- Import and export (ADR-018) carry the tables as they are. The merge-import rule (the later `updated_at` wins, and a tombstone counts as a change) applies; each table has `updated_at`, except `habit_check`, which uses `checked_at`, with a tombstone setting `checked_at` to the removal time. `crates/store/src/portability` lists the syncable tables, so it gains the four.

## Testing strategy
- **Core:** unit tests for `LocalDate` (month and year ends, leap day), `Weekdays::label`, `day_states`, `run_of_days` (one miss forgiven, two in a row end it, rest days ignored, today never breaks), `fresh_start`, `due_now` (grace window, weekday, finished, already nudged), and the templates' shape (five, every step named, wellness on).
- **Store:** migration from 6 to 7 on a filled database. Each repository's insert, update, move, tombstone and restore, with its `change_log` rows. Removing a routine tombstones its habits. Merge import of the new tables.
- **Service:** the commands through the recording host; every `run_*` path, including `Running`, the stale-run close, `Full` and the error mapping. Event emission happens after unlock. The nudge has the preference off or on, status granted or denied, once a day, finished routines and the grace window.
- **App (vitest):** `RoutinesPage` tests split by behaviour (overview, empty and template, editors, run view by keyboard, failure line, Undo), plus the Settings › Notifications row. Fixtures in `shared/test/` gain the routines builders.
- **Components:** each component test covers roles, names, the state words and shapes, keyboard behaviour and both themes through the specimen. `just contrast` gains any new colour pair.
- **Layout scenarios:** `dev/layout/scenarios` gains *routines-overview*, *routines-empty* and *routines-run* for the WebKit harness (append-only).

## Working beside the Board session
- Don't change the page list, the ⌘-number keys, `NavRail`, `NavPage` or `NavigatePage`. Only the `routines` case in `App.tsx`'s page switch changes.
- One migration list. The second to land renumbers.
- Never hand-merge `bindings.ts` or `permissions/autogenerated`; regenerate them after a rebase (`just bindings`, then a build).
- Append-only conflicts (`scenarios/index.ts`, `designSystem.test.ts` counts, icon lists, `capabilities/main.json`, `lib.rs` command lists, `Host`, `common-issues`): keep both sides and recount.
- Don't touch task or board code.

## Decisions
Every ruling here was made by the controller under the owner's autonomy grant (2026-11-14). Each is also recorded on its issue.
1. **One `habit` table for both routine steps and standalone habits** (`routine_id` NULL = standalone), not two tables. SPEC 2.4 calls it one module. A step *is* a habit, so its check-ins and dot grid work the same either way.
2. **When and where are free text; only the routine's time is a clock time.** "After breakfast" is a valid *when*, and only a routine's time drives a nudge.
3. **Check-ins store only *done*.** A scheduled past day with no check is *Not done*. There is no stored *skipped* state, so nothing has to be backfilled, and a skip inside a run stays only in the run's counts.
4. **`habit_check.id` is `<habit_id>:<date>`,** so two devices that check in on the same day merge into one row (ADR-002).
5. **28 days in the grid, with weeks aligned to Monday.** Four calm rows of seven fit the compact window (360 px) at `size-icon-md` with `gap-fluid-stack`. Days before the habit was created are left out, not drawn as misses.
6. **The run of days shows as words ("5 days kept") from 2 and up, and never as a big number or a flame.** A single not-done scheduled day is forgiven. The fresh-start line replaces it after two in a row.
7. **Templates are copied, never linked.** Editing a copy never changes the template. The copy keeps `template` only for the wellness note and its wording. Nothing is seeded on install; the empty state offers the templates.
8. **The run state lives in Rust and in the `routine_run` row** (ADR-013), with the step order frozen at start, so a reload or a second window resumes the same run.
9. **One global switch for the nudge, no per-routine switch.** A routine with *Any time* never nudges. This keeps Settings as the one place for notifications and the nudge off by default.
10. **Keys in the run view: Enter = Done, S = Skip for today, Esc = End routine.** S honours the single-key setting; Enter and Esc are standard button and dialog keys. No new global or menu shortcut, because the Board session owns the menu keys.
11. **Run view in place on the Routines page, not a window or full screen.** It is one route, and the person sees the rail. Full screen for routines can come later.
12. **New components: `RoutineCard`, `RoutineStep` and `DayPicker`; `HabitDots` gains `runLine` and `columns="week"`.** Everything else reuses existing components (`RoutineItem`, `WellnessNote`, `Dialog`, `Input`, `PopoverMenu`, `EmptyState`).
13. **Canvas picks: page A (cards), run view A (one step), dot grid A (weeks).** See [Design canvas](#design-canvas).
14. **ROADMAP:** P4 Routines runs now, alongside P2, and P3 comes later (owner, 2026-11-14).
15. **Today on an off day is `Rest`, not `Upcoming`** (R1, #514). An unchecked today that isn't on the schedule draws as a rest day, so the grid never asks for a habit on a day off. A checked day is `Done` whatever the schedule.
16. **A check-in on a rest day shows as `Done` but doesn't count toward the run of days** (R1, #514). Only scheduled days count, so an extra day never changes the run and a day off is never owed.
17. **The due window is clipped at local midnight** (R1, #514). A routine at 23:50 is due until 23:59 and not after midnight, so the nudge never lands on the next local day.
18. **`TemplateId` lives in core, and `TemplateId::as_str()` (camelCase, e.g. `morningLight`) is the text stored in `routine.template`** (R1, #514). Core owns the template data, so it owns the id; `TemplateId::parse` reads it back, and an unknown text means no template.
19. **`TemplateStep` has a `detail` (the evidence line, e.g. "The evidence is contested.") and `Template` has a `note` (the full wellness note)** (R1, #514). Both are worded once in core, so the service and the webview never assemble them.
20. **2-minute versions are written in lower case** ("one sip", "ten squats") (R1, #514), because the service words them into "2-minute version: one sip."

## Design canvas
Canvas: https://claude.ai/artifact/3d9UTChLuhpUrBufwGzVPv (private to the owner; every option in light and dark side by side).

| Surface | Options | Pick (controller, 2026-11-14) | Why |
|---|---|---|---|
| Routines page | A Cards · B Timeline and detail · C Compact rows | **A Cards** | One primary Start (the next routine due). Every routine and its steps are readable at a glance, built from `RoutineCard` and read-only `RoutineItem`s. B hides routines behind a selection, and C hides the steps and draws a routine-level strip that isn't a habit's record. |
| Run view | A One step · B Checklist | **A One step** | One thing on screen lowers the cost of starting for the ADHD audience. Enter, S and Esc map to one button each, and the progress list stays below in shape and word. B invites jumping around and has no clear next action. |
| Dot grid | A Weeks of 28 days · B 14-day strip · C 28 days, one wrapped line | **A Weeks** | Four Monday-aligned rows with a weekday header, so rest days line up and a rhythm shows without a number. B is too short to show the two-in-a-row rule kindly, and C (today's `HabitDots`) puts a Monday in a different column on every width. |

The owner can overrule any pick on review; components follow the pick (`HabitDots columns="week"` adds the weekday header row, aria-hidden).

## Open questions
None blocking. The owner may overrule any decision above after reviewing the canvas.

## Implementation status
- Plan: [docs/plans/2026-11-14-routines-and-habits.md](../plans/2026-11-14-routines-and-habits.md)
- Epic #513
- [ ] R1 (#514)
- [ ] R2 (#515)
- [ ] R3 (#516)
- [ ] R4 (#517)
- [ ] R5 (#518)
- [ ] R6 (#519)
- [ ] R7 (#520)
- [ ] R8 (#521)
- [ ] R9 (#522)
- [ ] R10 (#523)
