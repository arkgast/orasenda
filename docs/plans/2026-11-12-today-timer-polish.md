# Today and timer polish — Implementation Plan

- Spec: [docs/specs/2026-11-12-today-timer-polish.md](../specs/2026-11-12-today-timer-polish.md)
- Date: 2026-11-12
- Status: in backlog (#379, #381, #380)

## Overview
The plan has three tasks. The component comes first, then the Today grid, and the hint runs beside both.
- **P1** fixes TimerRing's digits in `packages/ui`. The Today and Focus window digit rules depend on it.
- **P2** gives Today's grid its gaps.
- **P3** is the keep-going hint, from Rust to the status line. It shares no owned file with P1 or P2.

Every UI task (P1, P2, P3) adds a **design-review step** after the opus code review. An opus agent reads the layout boxes and gaps at every size and state, checks them against the spec's goals 1–3, and lists anything still crowded. It takes no screenshots.

## Contract
- P3 adds the IPC contract `TimerView.hint: "keepGoing" | null`, the command `hint_shown(hint: Hint) -> Result<TimerView, TimerCommandError>`, and `SettingsTarget::KeepGoing` (`"keepGoing"`). `bindings.ts` is regenerated in P3. No other task consumes them.

## Impact
- **Affected call paths / consumers:**
  - TimerRing is used by Today (`TimeView.tsx:25`), FullScreenFocus (`full-screen-focus.tsx:227`, hence the Focus window) and the specimens.
  - `TimerView` is consumed by every surface; the new field is optional for the floater and the Focus window, which ignore it.
  - `SettingsTarget` is consumed by `Settings.tsx:107` and the native menu routes (`ipc.rs:79`).
- **Data and migrations:** no migration. There is one new device-only `meta` key, `hint.keep_going`.
- **Tests and downstream checks that must stay green:**
  - the `TimerView` builders in `apps/orasenda/src/test/fixtures.ts` (a new required field);
  - the exact capability lists in `lib_tests.rs`.
- **Rollout and rollback:** these are ordinary squash PRs, and reverting one reverts it. A stale `hint.keep_going` key is harmless after a revert.

## Dependency graph
```
P1 ──> P2
P3 (independent)
```
Can start immediately in parallel: P1, P3.

## Tasks

### P1: TimerRing digits fit H:MM:SS  (#379)
- Priority: 1
- Depends on: none
- Owns:
  - `packages/ui/src/components/ui/timer-ring.tsx`, `timer-ring.md`, `timer-ring.test.tsx` and `timer-ring.specimen.tsx`.
- Touches: none.
- Interfaces:
  - Produces: `data-length="short" | "long"` on `[data-slot=timer-ring-digits]` ("long" when `remaining.length > 5`); specimen frames `timer-ring-fluid-long` (400×400) and `timer-ring-fluid-long-<w>x<h>` at the smallest and largest specimen sizes.
- Acceptance:
  - [ ] For "1:29:59" and "25:00", the digits box lies inside the ring's inscribed square, inset by the stroke, in every fluid specimen frame and in the numeric 320 and the full ≥ 480 frames.
  - [ ] The digits' computed font size is at least `timer-md` (28px) in every fluid frame.
  - [ ] "MM:SS" digits keep today's computed font size at 400×400 (no change for 25-minute sessions).
  - [ ] The README states the rule: digits fit inside the ring for up to seven characters.
  - [ ] Only literal `cqi` factors inside the existing `DIGITS` style object change; there are no new tokens and no arbitrary Tailwind values.
- Tests first: `digits_length_attr_long_for_h_mm_ss` (vitest), `ring_short_digits_unchanged_at_400`.
- Notes: sonnet; opus review, then the design review. Mono digits are about 0.6 em per character. Pick one factor per path for "long" so the check passes at 160px with the `timer-md` floor. After the merge, the controller republishes the design-system artifact.

### P2: Today grid gaps  (#381)
- Priority: 1
- Depends on: P1 (the digit rules use `data-length`)
- Owns:
  - `apps/orasenda/src/features/today/today.css`.
- Interfaces:
  - Consumes: `data-length` from P1.
- Acceptance:
  - [ ] Ring layout: the vertical gaps top→status→ring→controls are ≥ 16px, or ≥ 12px when `data-compact`, at every ring size and state. An empty status row is skipped, and its neighbours are compared directly. The ring's box is its SVG.
  - [ ] Strip: the column gaps are ≥ 16px. Stacked strip: the row gaps are ≥ 8px.
  - [ ] `runningDeep`: the digits are inside the ring at every ring size on Today and in the Focus window's ring sizes.
  - [ ] At every size and state: one primary, no scroll, 44px targets, the status row at 44 or 88.
  - [ ] `today.css` uses only `var(--space-*)` tokens.
- Notes: sonnet; opus review, then the design review. The design reviewer reads the measured gaps. If 640×480 can't hold the gaps with a two-line status, the ring shrinks; it never goes below `timer-min-size`, and `timerLayout` is not changed.

### P3: The keep-going hint  (#380)
- Priority: 2
- Depends on: none
- Owns:
  - `crates/service/src/session/hint.rs` (new: the pending flag, the startup read of `hint.keep_going`, and `mark_shown`);
  - `crates/service/src/session/tests/hint.rs` (new);
  - `crates/service/src/api/hint.rs` (new: `Hint { KeepGoing }`);
  - `apps/orasenda/src-tauri/src/commands/hint.rs` (new: `hint_shown`);
  - `apps/orasenda/src/features/today/statusLine.ts` and its test;
  - `apps/orasenda/src/features/today/Today.hint.test.tsx` (new).
- Touches (additive):
  - Rust: `session/actions.rs` (the extend path sets pending), `session/view.rs` (`hint`), `session/cadence.rs` or wherever the focus end and the `autoContinue` change are handled (clear pending), `session/mod.rs`, `api/timer.rs` (`TimerView.hint`), `api/mod.rs`;
  - Tauri: `commands/mod.rs`, `commands.list.rs`, `lib.rs`, `capabilities/main.json`, `lib_tests.rs`, `ipc.rs` (`SettingsTarget::KeepGoing`), `ipc/bindings.ts` (regenerated);
  - webview: `Today.tsx` (the `hintShown` call and the `openSettings` action), `SettingsHeader.tsx` (the type), `Settings.tsx` (`keepGoing` scroll and focus; at 378 lines, keep under 400 or move the target handling into `settingsTarget.ts`), `CadenceRows.tsx` (an `id` on the checkbox only if it has none), `test/fixtures.ts` (`hintKeepGoing`).
- Interfaces:
  - Produces:
    - `TimerView { hint: Option<Hint> }`, serialized as `"keepGoing" | null`;
    - the command `hint_shown(hint: Hint) -> Result<TimerView, TimerCommandError>`;
    - `SettingsTarget::KeepGoing`;
    - the status action id `"openSettings"`.
- Acceptance:
  - [ ] A successful manual `timer_extend` (from the warning, or from a break with an open focus) while `autoContinue` is off and `hint.keep_going` is absent sets `hint: "keepGoing"`. An automatic step never sets it.
  - [ ] `hint_shown` writes `hint.keep_going` (RFC 3339), clears the hint and returns the view. After that, no later extend sets it, in this run or after a restart.
  - [ ] The hint clears when its focus ends (completes or is stopped) or when `autoContinue` turns on. A restart mid-focus drops it.
  - [ ] If the startup read fails, the hint is never set. If the write fails, the hint clears for this run and the failure is logged through the store error path.
  - [ ] Today shows *You can keep going automatically in Settings › Timer.* at the lowest rank, with the ghost **Open settings** button (accessible name "Open Timer settings"). Errors, the store line, the warning, notices, the offer, the check-in and the intent line all outrank it. Today calls `hint_shown` exactly once, the first time the line renders.
  - [ ] **Open settings** navigates to Settings › Timer, scrolls the "Keep going" row into view and focuses the *Keep going automatically* checkbox.
  - [ ] `hint_shown` is in `commands.list.rs`, granted to `main` only, and the exact capability list in `lib_tests.rs` matches.
  - [ ] Bindings are regenerated, and the TS fixtures set `hint: null`.
- Tests first:
  - Rust: `manual_extend_sets_keep_going_hint`, `auto_step_does_not_set_hint`, `auto_continue_on_does_not_set_hint`, `hint_shown_writes_meta_and_clears`, `hint_not_set_after_meta_written`, `hint_clears_at_focus_end`, `hint_clears_when_auto_continue_turns_on`, `hint_startup_read_failure_means_no_hint`, `hint_write_failure_clears_for_run`;
  - webview: `status_hint_lowest_rank`, `status_hint_outranked_by_warning`, `today_calls_hint_shown_once`, `open_settings_targets_keep_going`, `settings_keep_going_target_focuses_checkbox`.
- Notes:
  - sonnet; opus review, then the design review (the hint's status row at 900×600 and 360×640).
  - Use the `meta` pattern from `session/settings.rs:187` (`META_NOTIFY_REVIEW`).
  - Keep every file at 500 lines or fewer; `actions.rs` is at 285 lines.
  - The copy is kind and plain, with no exclamation mark.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: the digits fit, never below timer-md | P1, P2 (Today and Focus window `runningDeep`) |
| Goal 2: ring-layout gaps at every size and state | P2 |
| Goal 3: strip and stacked-strip gaps | P2 |
| Goal 4: no regression in `expectTodayFits` | P2, P3 |
| Goal 5: the hint once, and Open settings | P3 |
| TimerRing README rule | P1 |
| Failure mode: the digits cross 59:59 → 1:00:00 mid-session | P1: `digits_length_attr_long_for_h_mm_ss` (rerender from "59:59" to "1:00:00") |
| Failure mode: the hint while the store is unavailable | P3: `hint_startup_read_failure_means_no_hint` |
| Failure mode: an extension from the floater while Today is hidden | P3: `today_calls_hint_shown_once` (view arrives with the hint before Today mounts) |
| Failure mode: the hint outranked for the whole focus | P3: `hint_clears_at_focus_end` (`hint_shown` is never called, so the hint can return later) |
