# Session cadence (P1 sub-project E) — Spec

- Status: implemented (2026-11-12); approved (owner, 2026-11-12); amended the same day by the owner's auto-continue decision ([Auto-continue](#auto-continue))
- Date: 2026-11-12
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP P1, row E](../ROADMAP.md#p1-sub-projects), [#134](https://github.com/arkgast/orasenda/issues/134) (the re-cut and the amendment rule), [SPEC §1 and §2.1](../SPEC.md), [spec A](2026-11-08-focus-session-loop.md), [Settings spec (B)](2026-11-09-settings.md), [P1 components spec](2026-11-10-p1-components.md) ("E's components", line 148; "E's intent line", line 150), [Today redesign spec (C)](2026-11-11-today-redesign.md), [ADR-002](../DECISIONS.md#adr-002-local-storage-ready-for-sync), [ADR-011](../DECISIONS.md#adr-011-time-and-scheduling), [ADR-012](../DECISIONS.md#adr-012-store-crate-api), [ADR-013](../DECISIONS.md#adr-013-one-rust-state-many-surfaces), [ADR-014](../DECISIONS.md#adr-014-settings-one-object-one-save-chain-applied-in-rust), [ADR-015](../DECISIONS.md#adr-015-code-first-design-system-on-shadcn-tailwind-and-radix), [CONTEXT.md](../../CONTEXT.md). Components: `packages/ui/src/components/ui/{timer-ring,timer-strip,menu-bar-timer,floating-timer,full-screen-focus,inline-notice,start-button,popover-menu,mode-chip,wellness-note}.md`. Runs in parallel with D (Focus views); see [Shared with D](#shared-with-d).

## TL;DR
- **Presets become a library** (first task): a syncable `preset` table with three defaults, *Gentle Start 15/5*, *Steady Focus 25/5* and *Deep Work 90/15*, which the person can edit, remove, add to (up to 12) and restore. The fixed `Preset` enum and Custom go away; sessions keep a snapshot of the preset they started with.
- **The loop gets its rhythm:** a completed focus session starts its break by itself (a long break every *N* rounds), the break ends in idle, and the next focus waits for Start. "+10 min" extends focus from the two-minute warning or from the break, up to a global cap (default 2). "Just 2 minutes" ends with "Keep going?" and never starts a break.
- **Gentle limits and cues:** a two-minute warning on every surface (optional notification, off by default), a deep-hours cap that says one calm line past 4 hours and never blocks Start, and one rotating break suggestion, labelled honestly.
- **Intent without friction:** Start stays one press. While focus runs, a quiet "What will be done?" button in the status row lets the person name the session; it shows in the ring's `task` slot and is saved on `focus_session.intent` (NULL when not given; "Deep focus" is the display fallback).
- **Auto-continue is opt-in** (owner, 2026-11-12): with *Keep going automatically* on, a focus that reaches its end keeps going in 10-minute steps up to *Longest focus* (default 90 minutes), each with a quiet "Take a break". Off by default; the manual "+10 min" stays the default.
- The floater and full-screen states are E's last task, after D merges.

## Change in a nutshell
Steady Focus is selected. Press ⌘↩ at 14:00; the status row offers the intent button:

```
│            Steady Focus · ends 14:25 ⌄                  │
│   What will be done?                                    │  status row (quiet button)
│                     ╭ 24:59 ╮                           │
│                     ╰ Focus ╯                           │
```

Type "Outline chapter 3", Return: the line moves into the ring's `task` slot. At 14:23 every surface turns to `warning` once (triangle, "Almost up"; the menu-bar glyph becomes a triangle):

```
│ ▲ Two minutes left. Finish the thought.       +10 min   │
```

Let it run out. At 14:25 the break starts by itself (half circle, "Break", 5:00), and the row shows one suggestion:

```
│   Stand up and stretch gently.      +10 min  Skip break │
```

At 14:30 the break ends: "Break over. Start when you're ready." The next focus waits for Start. The database now holds one `focus_session` row (phase `focus`, intent "Outline chapter 3", extensions 0, preset Steady Focus 25/5/15/4) and one row with phase `break`, kind `short`. After the fourth completed round the break is the 15-minute long break. Press *Just 2 minutes* instead and, at its end, the row asks "Keep going?" with *Keep going* and *Stop here*; no break.

In Settings › Timer the presets are a list:

```
│ Presets        Gentle Start   15 / 5 · long 15 after 4    Edit  Remove │
│                Steady Focus   25 / 5 · long 15 after 4    Edit  Remove │
│                Deep Work      90 / 15 · long 30 after 2   Edit  Remove │
│                Add preset     Restore default presets                  │
│ Extra 10 minutes   ( ) Off  ( ) Once  (•) Twice  ( ) 3 times           │
│ Deep-hours cap     [x] Note when today's focus passes  [ 4 ] hours     │
```

## Problem
Spec A built one focus session and stopped there: `Phase` has only `Focus` (`crates/core/src/timer/mod.rs:108-110`), the engine always starts focus (`crates/core/src/timer/engine.rs:58`), and every record says `extensions: 0` (`engine.rs:187`, `engine.rs:228`). Presets are a closed enum with a Custom pair whose long break is derived as three times the break (`mod.rs:20-26`, `mod.rs:84-92`), so people cannot name or shape their own rhythm. P1's exit criterion is "usable daily as a focus timer" ([ROADMAP](../ROADMAP.md)); without breaks, the warning, extension, keep-going, the intent and the deep-hours cap (SPEC §2.1), the timer is a countdown, not a focus practice.

## Goals / Success criteria
1. **Library:** a fresh database lists exactly Gentle Start 15/5/15/4, Steady Focus 25/5/15/4 and Deep Work 90/15/30/2, with Steady Focus selected. Edits, removes, adds (12 max) and *Restore default presets* behave as in [Presets](#presets); every write logs `change_log` rows (entity `preset`). An existing database at schema 2 opens, migrates and works, with its old selection mapped.
2. **Cadence (core tests with injected `now_ms`):** a completed focus starts its break at the planned end; round *N* of the preset's chain gets the long break; the break ends in idle; the chain resets after a long break, at local midnight and after a gap longer than the long break.
3. **Records:** one `focus_session` row per focus session (its `extensions`, `intent` or NULL, and the preset snapshot) and one row per break (phase `break`), each in one transaction with its `change_log` rows; no row is ever written for something that did not happen.
4. **Warning:** at 2:00 left in a focus or a break longer than 2 minutes, `TimerView.mode` becomes `warning` exactly once per end; the menu bar shows the triangle; the notification posts only when the setting is on, macOS allows it and Orasenda is not frontmost.
5. **Extension:** "+10 min" adds 10 minutes to the same session while `extensions < cap`, from the warning or from the break; the row's `extensions` is the count taken.
6. **Auto-continue:** with the setting off, nothing changes. With it on, a running focus that reaches its end gains 10-minute steps (each an extension, the manual cap ignored) while its continuous focus stays within *Longest focus*; at the limit it completes and the break starts; a completed `quick` rolls into the saved preset with no break.
7. **Keep-going:** with auto-continue off, a completed `quick` session saves its own row, starts no break and offers *Keep going* (starts the selected preset at once) and *Stop here*.
8. **Deep-hours cap:** the focus session that takes today's focused time past the cap shows "You've focused 4 hours today. A good place to stop." once; while idle afterwards, the quiet line shows; Start is never disabled.
9. **Intent:** Start sends no intent; the status-row button sets and edits it; it is in the ring and strip `task` slot and in `focus_session.intent`; `session_name()` returns "Deep focus" when it is NULL.
10. **Suggestions:** every break shows one line from [the list](#break-suggestions), rotating, with its *optional* or *experimental* label.
11. **UI rules:** tokens only, both themes, one primary per screen, no state by colour alone, no red for time, kind copy; the WebKit harness passes the [new states](#testing-strategy) at C's size set; every file ≤ 500 lines.

## Non-goals
- Statistics or totals on screen (P4). `sessions_today` feeds rounds and the cap only.
- Linking a session to a task (P2); the intent is free text.
- Starting the next focus automatically; sound or chimes (P8); NSDR and the brief-rest cue (P8).
- Reordering presets, per-preset extension caps, presets in the Focus window popover beyond what D builds.
- An on/off switch for break suggestions (see [Open questions](#open-questions)).
- New design-system components or tokens. Break and warning are existing `mode` values ([components spec](2026-11-10-p1-components.md), line 148); the two-action rows are compositions of `InlineNotice variant="row"` and `Button`.
- The Focus window, the floater window, the app menu "Focus" and the ⌘K palette themselves (D).

## Users & permissions
One local user. New commands are granted to the `main` window in `apps/orasenda/src-tauri/capabilities/main.json` and listed in `commands.list.rs` (rule: `docs/conventions.md:43-44`); E's last task grants D's Focus and floater windows the timer commands they show.

| Caller | Can | Cannot |
|---|---|---|
| Webview `main` | `timer_extend`, `timer_set_intent`, `timer_dismiss_offer`, `timer_take_break` (Amended 2026-11-12 by the Session cadence plan: granted to `main`, and to the Focus and floater windows in E's last task), `presets_list`, `preset_add`, `preset_update`, `preset_remove`, `preset_undo_remove`, `presets_restore_defaults`, plus A–C's commands | write `preset` rows except through these commands; post notifications |
| Menu bar (Rust) | the same actions through the session service (ADR-013) | — |
| Orasenda process | post "Two minutes left." when allowed | ask for notification permission outside the Settings checkboxes (B's rule) |

## Tenancy & localization
- Single user, single device; presets and sessions are syncable (ADR-002), the live session device-only.
- **Today** is the local day: `[local midnight, next local midnight)` computed in core from `now_ms` and `LocalTime::utc_offset_min` (ADR-011), with the offset taken at the candidate midnight so a DST day is 23 or 25 hours. A session belongs to the day it **started**; midnight never resets a chain mid-run, and the cap line updates on the next idle view. A time-zone change uses the offset at the instant (accepted).
- Rust formats every time string and every line that carries a number ("You've focused 4 hours today.", "25 / 5 · long 15 after 4", menu headers). English only.

## Domain model
Terms are defined in [CONTEXT.md](../../CONTEXT.md) (E appends: preset library, default preset, preset snapshot, break, long break, round, chain, extension, extension cap, two-minute warning, keep-going offer, auto-continue, intent, deep-hours cap, break suggestion, open focus).

### Presets
- **`PresetDef`** (core) `{ id: PresetId, name, focus_min, break_min, long_break_min, rounds, default_key: Option<DefaultPreset> }`. Ranges *(author's call)*: name 1–40 characters after trimming, unique among live presets ignoring case; focus 5–180 and break 1–60 (B's ranges, `mod.rs:46-53`); long break 5–90; rounds (long break after) 1–8.
- **Defaults** (owner, 2026-11-12), with fixed ids so two devices seed the same rows *(author's call)*:

| `default_key` | Id | Name | Focus | Break | Long break | After |
|---|---|---|---|---|---|---|
| `gentle_start` | `0192f6a0-0000-7000-8000-000000000001` | Gentle Start | 15 | 5 | 15 | 4 |
| `steady_focus` | `0192f6a0-0000-7000-8000-000000000002` | Steady Focus | 25 | 5 | 15 | 4 |
| `deep_work` | `0192f6a0-0000-7000-8000-000000000003` | Deep Work | 90 | 15 | 30 | 2 |

  Deep Work's 90 minutes is presented as a convention, not physiology, as SPEC §2.1 (`docs/SPEC.md:36`) does.
- **Invariants:** at least one live preset; at most 12 live presets created through *Add preset* (restoring defaults may exceed 12, see Behavior); `timer.preset` names a live preset, and an unknown id is presented as the first live preset, the one with the lowest `position` (logged). The live table is never empty.
- **`quick`** stays a built-in, never listed: 2 minutes of focus, no break, no warning, no extension.
- **`SessionPreset`** (core, the snapshot a session keeps) `Library { id, name, focus_min, break_min, long_break_min, rounds } | Quick`. Editing or removing a preset never changes a running session.

### Engine (`crates/core::timer`, pure)
- `Phase` gains `Break`; `BreakKind = Short | Long`.
- `Session::Running` and `Paused` carry `preset: SessionPreset`, `phase`, `break_kind`, `started_ms`, `planned_ms` (grows by 10 minutes per extension), `paused_total_ms`, `gap_ms` (break time cut short by "+10 min", excluded from focus elapsed), `extensions`, `round` (fixed at start), `intent: Option<String>`, `warned` and, during a break, `open_focus: Option<SessionRecord>` (the finished focus, still extensible).
- **Transitions** (`now_ms` passed in):
  - `start(id, preset, round, now)`: focus.
  - `advance(now) -> Vec<Milestone>` (was `Option`, `engine.rs:201`): at 2:00 left (`planned_ms > 120 000`, not yet `warned`) → `Warned`; at a focus's planned end → the focus record goes to `open_focus` and a break starts **at the planned end**, long when `round` is a multiple of `rounds` → `BreakStarted`; at a break's planned end → `Ended([focus, break])`, idle. One call may cross several ends (sleep, relaunch); a warning whose end has also passed is not emitted.
  - `extend(now)`: in a running focus with `remaining ≤ 2:00` → `planned_ms += 10 min`, `extensions += 1`, `warned = false`. In a break → the break is recorded as `stopped` with its real length, focus resumes from `open_focus` with 10 more minutes, `gap_ms += ` the break's span. → `Extended`. The cap check is the service's.
  - `stop(now)`: in focus → `Ended([focus stopped])`; in a break (*Skip break*) → `Ended([focus completed, break stopped])`.
  - **Auto-continue** (`advance(now, auto: Option<longest_ms>)`, `auto` from the settings, `None` when off): at a **running** focus's planned end, if `planned_ms + 10 min ≤ longest_ms`, the end becomes a step: `planned_ms += 10 min`, `extensions += 1`, `warned = false`, `auto_step = true` → `Extended`. Otherwise the focus completes and the break starts as usual. Continuous focus is `planned_ms` (the focus's planned length with every extension, manual or auto) *(author's call)*. A `quick` that completes with `auto` set returns `Ended([quick])` plus `RollOn`, and the service starts the saved preset at the same instant (as *Keep going* does).
  - `take_break(now)`: in a running or paused focus → the focus completes with its real `focused_ms` and becomes the open focus; the break starts now → `BreakStarted`.
  - `set_intent(text, now)`: a running or paused focus, extensions included; refused in a break or idle.
- `quick`: its end is `Ended([quick completed])`, never a break.
- `SessionRecord` gains `preset: SessionPreset`, `break_kind`, `intent`; `extensions` is real. Invariant: for a focus row, `ended − started = focused + paused_total + time in breaks cut by "+10 min"`; those breaks are their own rows inside the span.
- **Round:** a focus session whose final row is `completed`: a natural end, with its extensions, including +10 taken from its break. A Stop at any point, also during an extension, writes `stopped` and is not a round. Quitting mid-break leaves the focus `completed`; the break follows the recovery rules.
- **Inputs:** `next_round` and `focused_today` both see today's stored rows, plus the `unsaved` records, plus the open focus. Recovery after a crash writes the open focus from the snapshot, so nothing is counted twice or lost.
- **`cadence::next_round(today: &[DaySession], now, long_break_ms) -> u8`** (pure), called by every start (a keep-going start included): walk today's rows in start order; a `completed` non-quick focus adds 1; a started long break resets to 0, even if skipped or cut; `quick` sessions neither count nor reset. Then, if the last break ended more than `long_break_ms` (of the preset being started) before `now`, reset to 0; the baseline is the end of the last break, and with no break yet today the count stands. Returns count + 1, so the first focus of a day is round 1. A session belongs to its start day, so midnight never resets a chain mid-run.
- **`cadence::focused_today(today) -> u64`**: the sum of `focused_ms` of those focus rows of every kind and end reason (`quick`, stopped, extended), plus the live focus.
- **`session_name(intent) -> &str`**: the intent, or "Deep focus".
- **`suggestions::pick(kind, n) -> &Suggestion`**: `n` is today's break rows of that kind (short and long counted separately); the entry at `n mod len` among the lines for that kind.

### Store (`crates/store`)
```sql
preset(id TEXT PRIMARY KEY /* UUIDv7 */, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
       deleted_at INTEGER NULL, name TEXT NOT NULL, focus_min INTEGER NOT NULL, break_min INTEGER NOT NULL,
       long_break_min INTEGER NOT NULL, rounds INTEGER NOT NULL, position INTEGER NOT NULL,
       default_key TEXT NULL)          -- syncable: change_log.entity = 'preset'
ALTER TABLE focus_session ADD COLUMN preset_id TEXT NULL;      -- and preset_name TEXT, focus_min,
  -- break_min, long_break_min, rounds INTEGER (the snapshot), break_kind TEXT ('short'|'long'), all NULL
```
- Repositories: `presets` (`list`, `get`, `insert`, `update` logging only changed fields, `remove` = tombstone, `undelete`), `focus_sessions::started_between(from, to)` (non-deleted rows, start order). `Entity` gains `Preset` (`crates/store/src/txn.rs:9-12`). `focus_sessions::insert` writes `intent` (today a literal NULL, `crates/store/src/repo/focus_sessions.rs:20`) and the new columns.
- `focus_session.preset` TEXT keeps its meaning for old rows (`classic`, `fifty_ten`, `deep_block`, `custom`, `quick`); new rows write `quick` or `library` *(author's call)*. Readers map old names to labels and never fail on them.

### Where each piece lives
Core: `timer/{mod.rs, engine.rs, preset.rs, cadence.rs, suggestions.rs}` (new files keep each ≤ 500 lines). Store: `repo/presets.rs`, the migration. Service: `session/{presets.rs, cadence.rs}` (new), `api/{timer.rs, settings.rs, presets.rs}`. App crate: commands, tray, notifications. Webview: `features/today/{StatusRow.tsx, IntentField.tsx}`, `features/settings/sections/{Timer.tsx, PresetList.tsx, PresetEditor.tsx}`.

## Interfaces

### IPC (regenerated `apps/orasenda/src/ipc/bindings.ts`)
- **`TimerView`** (`crates/service/src/api/timer.rs:42-60`): `mode` gains `break | warning` (derived in `session/view.rs` only, as today at `view.rs:25-29`: paused → `paused`; running focus **or break** longer than 2:00 with `remaining ≤ 2:00` and `warned` → `warning` (chip "Almost up", triangle, tray triangle); running break → `break`; running focus → `focus`). `preset: Preset | null` is replaced by `presetId: string | null`, `presetName: string | null` (Rust: the snapshot name, or "Just 2 minutes"), `quick: boolean`. New: `breakKind: "short" | "long" | null`, `breakMin: number | null` (the snapshot's break, for C's running heading), `extensions`, `canExtend` (`extensions < cap`, extensions from the warning and from the break counting the same; offered in a running focus with `remaining ≤ 2:00` or a running break with an open focus; never for `quick`; not in focus while auto-continue is on; while paused, +10 is hidden and returns on resume), `intent: string | null`, `suggestion: { text: string, label: "optional" | "experimental" | null } | null`, `offer: "keepGoing" | null` (never set while auto-continue is on), `checkIn: string | null` ("Still going · ends 15:40", while running in an auto step), `capLine: string | null` (the idle quiet line).
- **`MilestoneKind`** (`crates/service/src/api/events.rs:9-15`) gains `warned`, `breakStarted`, `extended`, `capReached`; `ended` covers both ends of a break; `MilestoneEvent` gains `phase` and `quick`.
- **`StartRequest`** (`api/timer.rs:94-97`) becomes `{ quick: boolean }`: the service starts the selected preset or `quick`; `custom` is gone *(author's call)*.
- **Commands** (camelCase, errors `{ kind, message }`):
  - `timer_extend() -> Result<TimerView, TimerCommandError>`: `wrongState` when not offered, `extensionCap` (new kind) at the cap.
  - `timer_set_intent(intent: string | null)`: trimmed, inner whitespace collapsed, at most 120 characters (`invalidIntent` otherwise), an empty string clears it to NULL; a running or paused focus, extensions included (`wrongState` in a break or idle).
  - `timer_dismiss_offer()`: clears the keep-going offer (*Stop here*); idempotent.
  - `timer_take_break()`: ends the focus as `completed` and starts the break (`wrongState` outside a focus).
  - *Skip break* is `timer_stop` in a break; *Keep going* is `timer_start({ quick: false })`, which also clears the offer.
  - `presets_list() -> PresetEntry[]` (replaces `presets_get`, `apps/orasenda/src-tauri/src/commands/presets.rs:9`), `PresetEntry { id, name, focusMin, breakMin, longBreakMin, rounds, isDefault, isChanged }`; `preset_add() -> PresetEntry`; `preset_update(id, patch: { name?, focusMin?, breakMin?, longBreakMin?, rounds? })`; `preset_remove(id)`; `preset_undo_remove(id)`; `presets_restore_defaults()`. `PresetError.kind`: `invalid` (with `field`), `duplicateName`, `limit`, `lastPreset`, `notFound`, `unavailable`, `write`.
- **Events:** `presets-changed` with `PresetEntry[]` after any preset write, from any surface. `timer-tick` while idle also fires once at local midnight when `capLine` changes, and once when the offer clears.
- **`Settings`** (`crates/service/src/api/settings.rs:22-27`) becomes `{ theme, presetId, extensionCap: 0..=3, autoContinue, longestFocusMin, deepCapOn, deepCapHours, notifySessionEnd, notifyTwoMinutes }`, still `deny_unknown_fields`. Keys: `timer.preset` (a preset id), `timer.extension_cap` (default 2), `timer.auto_continue` (bool, default false), `timer.longest_focus_min` (int 60–150, default 90), `timer.deep_cap_on` (bool, default true), `timer.deep_cap_hours` (int 2–8, default 4), `notify.two_minutes` (default false). `timer.custom` is no longer read (`session/settings.rs:23`); its row stays, unread *(author's call)*.

### Today
- **Status row** (C's table, `docs/specs/2026-11-11-today-redesign.md:141-155`, amended): one line by priority, plus at most two actions. The line is the `InlineNotice variant="row"` message; the first action is its own action, a second is a sibling `Button` in `features/today/StatusRow.tsx` (a composition, as line 148 of the components spec allows).

| Rank | When | Tone | Text | Actions |
|---|---|---|---|---|
| 1 | C's three action answers | as C | as C | as C |
| 2 | **focus** with `remaining ≤ 2:00`, running (focus only) | warning | "Two minutes left. Finish the thought." (InlineNotice README) | quiet "+10 min" (name "Add 10 minutes of focus") while `canExtend` |
| 2 | the same, in an auto step | warning | "Two minutes left. Finish the thought." | quiet "Take a break" (no "+10 min": steps replace it) |
| 2 | the focus that crossed the cap ended | neutral | "You've focused 4 hours today. A good place to stop." | in a break, the break's actions |
| 2 | a break, also in its last 2:00 (`mode: warning`; the row stays the break row) | neutral | the suggestion, with its label as a first word: "Optional: look at something far away." | quiet "+10 min" (name "Back to focus for 10 more minutes") while `canExtend`; ghost "Skip break" |
| 2 | `offer: keepGoing` | neutral | "Keep going?" | quiet "Keep going" (name "Keep going with Steady Focus"); ghost "Stop here" |
| 2 | running in an auto step, not in its last 2:00 | neutral | "Still going · ends 15:40" | quiet "Take a break" (name "Take a break now") |
| 2 | a break ended by time | neutral | "Break over. Start when you're ready." | none |
| 2 | *Skip break* | neutral | "Break ended." | none |
| 2 | C's "Session ended." and recovered lines | as C | as C | none |
| 3 | store line | as C | as C | none |
| 4 | focus running or paused, nothing above | — | empty | quiet "What will be done?" or "Edit intent" |
| 5 | idle, `capLine`, nothing above | rest | "4 hours of focus today." | none |

  In the stacked strip the row also carries the `ModeChip`; there the break suggestion is left out and only the actions show *(author's call)*.
- **Intent field** (`IntentField.tsx`): the button swaps the row's content for an `Input` labelled "What will be done?" (`maxLength` 120); Return or blur saves through `timer_set_intent` (an empty Return clears it to NULL), Esc restores the saved text; focus returns to the button. Quitting with the field open loses unsaved typing. Opened only by the person: the button, or the palette's "Set intent", which navigates to Today and then opens the field through an event.
- **Time view:** `TimeView` passes `task={view.intent}` to `TimerRing` and the wide `TimerStrip` (C passes none, `today-redesign.md:106`; the stacked strip still takes none, `timer-strip.md:20`).
- **Controls in a break:** the round button is "Pause break" / "Resume break"; the `md` icon button is "Skip break" (same command and ⌘. as End session) *(author's call: the row and the controls both offer it so ⌘. keeps working)*.
- **Preset summary and popover** (C's table, `today-redesign.md:116-139`): names come from the library; the idle popover lists every live preset as a radio with meta "25 / 5" and the link row "Edit presets in Settings"; the running heading becomes "<name> · <focus> / <break>" from the snapshot (C's deferred "/ <break>", `today-redesign.md:139`); in a break the summary reads "Steady Focus · break · ends 14:30" ("long break" for a long one).

### Settings
- **Timer** (B's section, `docs/specs/2026-11-09-settings.md:189`, `apps/orasenda/src/features/settings/sections/Timer.tsx:105-138`):
  - **Presets:** `PresetList.tsx`. Each row is a `Choice` radio (the selected preset; the SettingsIndex value is its name) with the meta "25 / 5 · long 15 after 4" and ghost *Edit* and *Remove* (names "Edit Steady Focus", "Remove Steady Focus"). *Edit* opens `PresetEditor.tsx` under the row: `Input`s Name, Focus (min), Break (min), Long break (min), Long break after (rounds), each saving on blur or Return and restoring on Esc, with always-visible range helpers, as B's minute fields do; *Done* closes it. Below the list: *Add preset* (adds "New preset" with Steady Focus's lengths, opens its editor, focus on Name) and *Restore default presets*.
  - **Extra 10 minutes:** radios Off, Once, Twice, 3 times; helper "How many times "+10 min" is offered in one session."
  - **Deep-hours cap:** `Choice` checkbox "Note when today's focus passes" and an hours `Input` (2–8); helper "A calm note, once a day. Start is never blocked."
  - **Keep going automatically:** `Choice` checkbox, off by default; helper "When a session ends, keep going in 10-minute steps, with a break one click away." Under it, **Longest focus** `Input` (60–150 min, default 90), helper "Steps stop here and the break starts." With Deep Work (90) and the default 90, auto-continue adds nothing until the limit is raised; the helper says so when the selected preset's focus is at or above the limit: "<preset name> already reaches this, so no steps are added."
  - **Break suggestions:** one line and a `WellnessNote`: "Wellness suggestions, not medical advice. Some are marked optional or experimental where the evidence is thin."
  - Save-line copy follows B's family: "Saved. Steady Focus is now 30 / 5, long 15 after 4.", "Removed Deep Work." with ghost *Undo*, "Default presets restored.", "Extra 10 minutes: twice.", and B's failure forms ("Focus minutes weren't saved. Still using 25.").
- **Notifications:** a second `Choice` checkbox, "Two minutes before the end", under *Tell me when a session ends*; ticking it while `notDetermined` asks macOS through the same `notifications_request` path (B); helper "Only while Orasenda is in the background."

### Menu bar (`apps/orasenda/src-tauri/src/tray/`)
- **Glyphs:** `warning` (triangle) and `break` (half circle) template images join `focus`, `paused` and `idle` (`tray/render.rs:13-15`, `render.rs:37-41`), as the MenuBarTimer README's table says (`menu-bar-timer.md:13-21`; E removes its two "(later)" marks).
- **Items** (C's table, `today-redesign.md:193-208`):

| State | Items |
|---|---|
| idle | Start focus · 25 min · Just 2 minutes · Preset ▸ (every live preset, "Steady Focus 25 / 5", checked; then "Edit presets in Settings…") — then C's rest |
| focus, warning | *Almost up · 2 minutes left · ends 14:25* — Pause session · Add 10 minutes (while `canExtend`) · End session — … |
| focus, auto step | *Focus · 9 minutes left · ends 15:40* — Pause session · Take a break · End session — … |
| break | *Break · 4 minutes left · ends 14:30* (or *Long break*) — Pause break or Resume break · Back to focus · 10 min (while `canExtend`) · Skip break — … |

  The accessibility label follows the mode word ("Orasenda, Almost up, …", "Orasenda, Break, …").

### Notifications (`crates/service/src/scheduler/publish.rs:13-14`, `:42-44`)
| Moment | Setting | Title | Body |
|---|---|---|---|
| focus completed, break starts | `notify.session_end` | "Focus session complete." | "Time for a break." / "Time for a long break." |
| `quick` completed | `notify.session_end` | "Focus session complete." | "Keep going if you like." |
| break completed | `notify.session_end` | "Break over." | "Start focus when you're ready." |
| two minutes left | `notify.two_minutes`, and Orasenda not frontmost | "Two minutes left." | "Finish the thought." / "Your break ends soon." |

When several ends pass during sleep, one `advance` posts one notification, for the latest state (accepted). "Frontmost" means Orasenda is the active app (`NSApplication.isActive`), not that some window has focus; D's non-activating floater does not count. The app crate reads it through `crates/platform-macos` on the main thread and caches it from the activation notifications. Permission is requested only by ticking a Settings box (B's flow).

### Break suggestions
Rust picks one per break (`suggestions::pick`); the list lives in core so every surface shows the same line. Sources (verified): Biwer et al. 2023, structured "Pomodoro" breaks versus self-regulated ones (https://pubmed.ncbi.nlm.nih.gov/36859717/); Albulescu et al. 2022, meta-analysis of micro-breaks, vigor and fatigue (https://doaj.org/article/c6f37b6ba159469296b2cb968b65505f); Balban et al. 2023, daily 5-minute breathwork including cyclic sighing (https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947).

| Text | Breaks | Label | Basis |
|---|---|---|---|
| Stand up and stretch gently. | short, long | none (moderate) | Albulescu 2022 |
| Look at something far away. | short | optional | no source opened; labelled until one is (E3) |
| Take a slow sip of water. | short | optional | no source opened; labelled until one is (E3) |
| Breathe in twice, then out long. | short | optional | Balban 2023 tested a daily 5-minute practice, not one sigh |
| Walk to another room. | short, long | none | Albulescu 2022 |
| Step outside for some daylight. | long | optional | no source opened; labelled until one is (E3) |
| Sit quietly and let your mind wander. | long | experimental | Buch et al. 2021 tested motor skills only; labelled until a source is opened (E3) |
| Close your eyes and rest for a few minutes. | long | experimental | no source opened; labelled until one is (E3) |
| Leave your phone where it is. | short, long | none | product principle (breaks steer away from the phone, SPEC §2.1) |
| Make a warm drink and sip it slowly. | long | optional | no source opened; labelled until one is (E3) |

Labelled lines read "Optional: step outside for some daylight." and "Experimental: sit quietly and let your mind wander." Biwer 2023 is the basis for offering breaks at all, not for any one line.

## Behavior & edge cases
- **Natural focus end:** the break starts at the planned end, not when the app notices; no "Session ended." line; focus stays on the Pause control, which becomes "Pause break".
- **+10 from a break:** the break row is `stopped` with its real length; focus continues with the same id, intent and round; `canExtend` re-evaluates. A pause during the break counts in the break's `paused_total_ms`, not the focus's.
- **End session in focus** (stopped): no break, "Session ended.", not a round. **Skip break** or ⌘. in a break: the focus row is `completed`, the break `stopped`, idle with "Break ended.".
- **Pause in a break** freezes it like a focus session; a paused break never ends.
- **Sleep or quit across ends:** a focus whose end passed starts its break at that end; if the break's end also passed, both rows are written, the engine is idle and, at relaunch, the `recovered` line shows. A running break restored in time continues. Quitting mid-break leaves the focus `completed`; a crash recovery writes the open focus from the snapshot. An `active_session` snapshot from before E does not decode and the app starts idle (`crates/service/src/session/recovery.rs:37-38`); the migration also clears it (dev data, no users).
- **Writes:** the focus row is written when its break ends (any way), with the break row, in one transaction; until then the open focus lives in the device-only snapshot, which every transition writes (spec A's rule). A failed write keeps both in `unsaved`, as spec A does for one.
- **Warning edges:** planned ≤ 2:00 (quick, a 1–2 minute break) → no warning. Extension during the warning → back to `focus`, `warned = false`, a new warning 2:00 before the new end. The warning row clears at the end or at +10.
- **Caps:** at the extension cap the "+10 min" action and menu item disappear (no disabled control); cap Off → never offered. Lowering the cap mid-session applies at once.
- **Deep-hours notice** is derived, never stored: `capReached` fires at the end milestone of the session where total-before < cap ≤ total-after, for any session kind (`quick`, stopped, extended). A relaunch does not fire it again. A cap change mid-day triggers nothing retroactive; the idle `capLine` compares the current total with the current cap. A 3-hour session started at 3 h 50 m is not interrupted.
- **Keep-going offer:** cleared by any transition, *Stop here*, *Keep going*, a page change away from Today or relaunch; it never starts anything by itself. A `quick` session ended early gets "Session ended." and no offer.
- <a id="auto-continue"></a>**Auto-continue:**
  - The two-minute warning fires before each step's end (and the notification, under its own rules). No notification at a step; the end notification fires when the focus really ends.
  - **Pause during a step:** a paused focus never ends; the check-in hides with the mode and returns on resume. Steps apply only at a running end.
  - **End during a step:** `stopped`, as any End: no break, not a round.
  - **Take a break:** the focus is `completed` (a round) with its real focused time, and the break starts at once.
  - **Sleep across several steps:** `advance` applies each step at its wall-clock end up to the limit, then completes the focus at the limit and starts the break at that instant; the break follows its own wall-clock rules (it may also have ended). No warnings are emitted for passed ends.
  - Turning the setting off mid-step applies at the next end. Rounds and the deep-hours cap treat auto steps like manual extensions. With it on, "+10 min" is not offered in focus (still offered from a break, under the manual cap) and the keep-going offer never shows: a completed `quick` rolls straight into the saved preset unless the person pressed Stop.
- **Intent:** settable while the focus runs or is paused, extensions included; survives pause, extension and relaunch (in the snapshot); a keep-going session starts without one; break rows store NULL.
- **Presets:**
  - *Remove* on the last live preset is `aria-disabled` with "At least one preset stays." Removing the selected preset selects the first remaining one (lowest `position`) and says so in the save line ("Removed Deep Work. Steady Focus is selected.").
  - *Add preset* at 12 is `aria-disabled` with "Up to 12 presets."; *Restore default presets* is `aria-disabled` with "The default presets are all here." when nothing differs. Restore un-tombstones missing defaults at their original positions (shifting the others after them) and rewrites changed ones, leaves user presets alone, and may take the list past 12. `isChanged` is always false for user presets.
  - *Undo* (`preset_undo_remove`) when the name is now taken → `duplicateName`; the save line says "Another preset has this name now. Rename it first." and the preset stays removed.
  - A duplicate name: "Another preset has this name. Still using Deep Work."; a name of only spaces: "A name needs at least one letter or number."
  - While a session runs, edits apply to the next session (B's line "A session is running. Changes apply to your next session." stays).
  - Store degraded: the list shows core's defaults, read-only, with B's newer/unavailable lines; Start uses the presented selection.
- **Races (ADR-013):** `timer_extend` after the cap or after the end is `wrongState`/`extensionCap`, a race, shown nowhere (C's rule).
- **Reduce motion:** the warning fade is instant (components); nothing else moves.

## Data & migrations
- **Migration `000N_preset_library.sql`** (N assigned at landing, after D's `window_frame` if D lands first): creates `preset`, adds the `focus_session` columns, `DELETE FROM active_session`, and inserts `meta('preset_seed', 'pending')`.
- **Seeding** runs in the service (UUIDs and `change_log` rows need Rust), in one transaction, only while the marker is pending, never again after: insert the three defaults by id, insert-or-ignore; tombstoned defaults stay tombstoned until *Restore*; map the old `timer.preset`: `classic` → Steady Focus, `deep_block` → Deep Work, `fifty_ten` → a new user preset "50/10" (50/10, long 20 after 4: its old lengths, `mod.rs:82`), `custom` → a new user preset "Custom" from `timer.custom` (long = break × 3, after 4, as `mod.rs:84-92` derived) *(author's call: keep what the person used, only when it was selected)*; absent → Steady Focus. Then write `timer.preset` and remove the marker. A failed seed is owed and retried like spec A's owed reads; meanwhile presets are core's defaults in memory.
- No compatibility promise beyond "opens and works": dev data is disposable and there are no users. Old `focus_session` rows keep their `preset` text and NULL snapshot columns.
- G's export includes `preset` rows and ignores `timer.custom`.

## Testing strategy
- **Core** (`cargo test`, injected `now_ms`): break and long break at round N for each default; chain resets after a long break, at local midnight (and a DST day), after a gap of `long_break + 1 ms` but not at exactly `long_break`; extension from the warning and from a break (gap excluded, break row `stopped`); warning exactly once, again after an extension, never for ≤ 2:00; `quick` → no break, no warning; auto-continue: steps at a running end up to the limit, none when focus ≥ limit (Deep Work at 90), `take_break` completes and starts the break, End during a step is `stopped`, a paused end takes no step, sleep across several steps stops at the limit and starts the break at that instant, quick rolls on; sleep across a focus end and its break end (two records, ends at planned ends, one milestone each, no warning); stop in focus and in a break; `focused_today` counts stopped and quick; `next_round` ignores quick and stopped; `session_name(None) == "Deep focus"`; `suggestions::pick` rotation per kind; preset validation edges (4/5/180/181, 0/1/60/61, long 4/5/90/91, rounds 0/1/8/9, names).
- **Store** (real SQLite): migration from a schema-2 database built in the test by the current migrations, with each old `timer.preset` value; `preset` writes log one row per changed field and a tombstone; `started_between` excludes deleted rows; old rows with `fifty_ten` still read. (Amended 2026-11-12 by the Session cadence plan: each migration test builds the schema just before its own migration from the `MIGRATIONS` list, not a literal schema 2, since D's migration may land first.)
- **Service** (fakes as in `session/tests/support`): seeding and conversion; at-least-one and 12 rules; restore defaults; snapshot on start; `TimerView.mode` for every phase; `canExtend` at caps 0–3; cap line once a day and the midnight `timer-tick`; keep-going offer lifecycle; warning notification gated by setting, status and frontmost; one notification per `advance`; writes and `unsaved` for the two-row end; recovery mid-break.
- **App crate:** tray items and glyphs per state, Preset submenu from the library, header strings.
- **Vitest:** `statusLine` priority for every row above (the check-in and the auto-step warning included); the auto-continue checkbox and Longest focus field; `StatusRow` two actions and names; `IntentField` Return/blur/Esc and no auto-open; Start sends `{ quick }` only; PresetSummary with library names and the break heading; Settings `PresetList`/`PresetEditor` (save on blur/Return, Esc, errors, Remove/Undo, Add at 12, Restore), extension cap, deep cap, the Notifications checkbox.
- **WebKit harness** (C's size set, `today-redesign.md:108`, both themes): new Today states: warning with +10, break with suggestion and two actions, long break, labelled suggestion, keep-going, auto-step check-in, auto-step warning, break over, cap line in a break, idle cap line, intent button, intent field open, ring and wide strip with a two-line intent; Settings › Timer with the editor open and 12 presets. Each must fit without scrolling, with one primary.
- **By eye (owner, no screenshots in PRs):** each new state above at 360×240, 900×600 and 1440×900 in light and dark; the menu bar's triangle and half circle in both menu-bar appearances; the warning fade with and without reduce-motion. VoiceOver passes are deferred to the end of P1 (#326); names and roles are asserted in code (`toMatchAriaSnapshot`).

## Shared with D
D builds the Focus window, the floater panel, the "Focus" app menu (⌘⇧F, ⌘⇧T, ⌘K), the ⌘K palette and a device-only `window_frame` migration (ADR-016). Files both change, for the plan to sequence:
- `apps/orasenda/src-tauri/src/tray/menu.rs` and `tray/tests/menu_items.rs` (D: Full screen ▸, floating timer item; E: Preset submenu, break and warning items).
- `apps/orasenda/src/features/today/Today.tsx`, `today.css` (D: the top-end Focus view button, `Today.tsx:217-218`; E: status row and `task`).
- `crates/store/src/migrate.rs`, `crates/store/src/lib.rs:35` (`SCHEMA_VERSION`), `crates/store/migrations/`: whichever lands second takes the next number at rebase, a pure rename (the SQL holds no version).
- `crates/service/src/api/*.rs`, `apps/orasenda/src-tauri/src/lib.rs` (command registration), `commands.list.rs`, `commands/mod.rs`, `capabilities/main.json`; `apps/orasenda/src/ipc/bindings.ts` is regenerated after rebasing, never hand-merged.
- D's palette command list (file named by D's spec): E adds "Set intent" (opens the intent field; only while a focus session runs).
- `CONTEXT.md`: both append rows at the end of the term table.
- E's last task changes D's Focus window and floater hosts to pass `mode`, `task` and the break, warning, +10, Skip break and keep-going states into `FullScreenFocus` and `FloatingTimer`. (Amended 2026-11-12 by the Session cadence plan, owner ruling: the components gain these actions first in a code-first design-system task, E11, "Break actions on FullScreenFocus and FloatingTimer"; E's last task depends on it and wires the props.)

## Amends earlier specs
Each amendment is a short marked line, "(Amended 2026-11-12 by the Session cadence spec)", edited in at the place named, never a rewrite.

| Spec | Line | Change |
|---|---|---|
| A | 111 (`Preset`) | The fixed enum and Custom are replaced by the preset library; `quick` stays. |
| A | 112–117 (`Phase`, engine, `Milestone`, `SessionRecord`) | `break`, the open focus, `advance` returning several milestones, the snapshot fields. |
| A | 145 (settings keys) | `timer.preset` holds a preset id; new timer and notify keys; `timer.custom` retired. |
| A | 190, 194, 196–197, 199 (`TimerView`, `timer_start`, settings, `sessions_today`) | As [IPC](#ipc-regenerated-appsorasendasrcipcbindingsts). |
| A | 210, 214, 227 (menu bar, notification, natural end) | Glyphs and items; the notification table; a completed focus starts its break. |
| A | 250 (`extensions`, `intent`) | Now written. |
| B | 87–88, 189–190 | Keys, Settings › Timer and Notifications rows as above. |
| C | 80, 116–139, 141–155, 193–208 | `presets_list`, summary and popover from the library, the status-row table, the menu-bar table. |
| Components | 150 | The intent is entered after Start from the status row, not with `Input` before Start (owner, 2026-11-12). |

## Decisions
- Relies on ADR-002 and ADR-012 (the `preset` table has the full syncable shape), ADR-011 (time in Rust, local day by offset), ADR-013 (every surface acts through the service), ADR-014 (settings chain; presets are a separate entity with their own commands), ADR-015 (README changes in code: InlineNotice "Today slots", MenuBarTimer glyph table).
- No new ADR. Fixed ids for seeded default rows may become a pattern for P4's routine templates; see Open questions.
- **Owner decisions** (2026-11-12): opt-in auto-continue (after the research pass); the cadence, chain, keep-going, deep-hours cap, intent, preset library and defaults, warning, suggestions and D sequencing in this spec.
- **Author's call for the owner to look at:** a started long break resets the chain even when it is skipped or cut by "+10 min".
- **Author's calls:** validation ranges for long break (5–90) and rounds (1–8), names unique and 1–40 characters; fixed default ids; `fifty_ten` and `custom` become user presets only when selected; `timer.custom` left unread; `focus_session.preset = 'library'` for new rows; `StartRequest { quick }`; the round fixed at start and the gap measured against the preset being started; a session belongs to the day it started; quick sessions count toward deep hours; "+10 min" offered for the whole break, the cut break recorded as `stopped`, and the focus row written when its break ends; Skip break also on the controls and ⌘.; the deep-hours line once a day at the end of the crossing session, hours whole; the idle cap line "4 hours of focus today." in the row's rest tone; break-end and skip copy; the label as a first word ("Optional: …") and the wellness note in Settings, not beside each line; no suggestion in the stacked strip; intent saved on blur, 120 characters; "Deep focus" shown on no P1 surface (for G's export and P4's stats); the keep-going offer held in Rust; one notification per `advance`; remove with *Undo* rather than a confirmation; restore may exceed 12; the migration clears `active_session`.

## FAQ
### Why is the focus row written at the break's end, not the focus's?
"+10 min" from the break continues the same session, and rows are append-only (ADR-002). Writing at the break's end keeps one honest row with its final `extensions`; the open focus is safe in the device-only snapshot meanwhile.

### Why compute rounds from today's rows rather than keep a counter?
Rows already hold the truth; a counter would need its own reset, sync and repair rules. Midnight falls out of "today's rows", and a relaunch needs nothing.

### Why fixed ids for the defaults?
Two devices that seed independently would otherwise sync two "Steady Focus" rows. Fixed ids also make *Restore default presets* a plain update.

### Why is auto-continue off by default?
Without something that prompts a stop, time blindness (common with ADHD), fatigue and sitting build up unnoticed, and hyperfocus can carry a person well past what they meant to spend. So the default asks before going on ("+10 min" up to a cap), and auto-continue, for those who want it, is capped by *Longest focus*. Orasenda makes no claim that extending helps or harms: the research pass found no evidence either way. What the defaults lean on is the work on structured breaks (Biwer et al. 2023, https://pubmed.ncbi.nlm.nih.gov/36859717/), on micro-breaks (Albulescu et al. 2022, https://doaj.org/article/c6f37b6ba159469296b2cb968b65505f) and the reviews of hyperfocus (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12438511/).

### Why does the keep-going offer live in Rust?
The floater and full screen (E's last task) must show the same offer as Today (ADR-013).

## Open questions
1. **An off switch for break suggestions?** Not asked for; easy to add as a Settings › Timer checkbox. Recommendation: wait for beta feedback.
2. **Should "fixed ids for seeded defaults" become an ADR** (ADR-017) before P4's routine templates? Recommendation: decide in P4's spec.
3. **The six "to verify" suggestion lines** (resolved in E3, #342): none had a source opened, so all six ship labelled Optional or Experimental (water moved from none to optional). A later source can remove a label.

## Implementation status
Planned as seven tasks: (1) preset library, core to IPC; (2) preset library UI (Settings, Today, menu bar; B's settings-chain tests in its Touches); (3) cadence engine, `sessions_today`, settings keys, auto-continue steps and `timer_take_break`; (4) Today and menu-bar states (the check-in included), notifications, Settings rows (Keep going automatically, Longest focus), README updates; (5) intent line; (6) break suggestions, with a verification step: a line ships only with a verified source or labelled "Optional"/"Experimental", and nothing unverified is stated as fact; (7) floater and full-screen states, after D.

All merged 2026-11-12; the by-eye checks of the last task and the VoiceOver passes (#326) stay with the owner.
- [x] E1 Preset library: core types and store (#340, PR #352)
- [x] E2 Move-only split of the engine and its tests (#341, PR #356)
- [x] E3 Break suggestions: the list, the pick, the source check (#342, PR #357)
- [x] E11 Break actions on FullScreenFocus and FloatingTimer (#343, PR #358; design system)
- [x] E4 Preset library: the switch (#344, PR #360)
- [x] E5 Preset editing and Settings › Timer list and editor (#345, PR #361)
- [x] E6 Cadence engine (#346, PR #362)
- [x] E7 Cadence service and IPC (#347, PR #364)
- [x] E8 Today: cadence states and the intent line (#348, PR #369)
- [x] E9 Menu bar, notifications and the cadence Settings rows (#349, PR #370)
- [x] E10 Floater and full-screen states, "Set intent", close-out (#350, PR E10_PR)
- [ ] Plan
- [ ] Issues
