# Today and timer polish — Spec

- Status: approved (owner, 2026-11-12)
- Date: 2026-11-12
- Owner: Arnold Gandarillas Castillo
- Related: [spec C, Today redesign](2026-11-11-today-redesign.md) (Today's grid and size set), [spec D, Focus views](2026-11-12-focus-views.md) (the Focus window harness), [spec E, Session cadence](2026-11-12-session-cadence.md#auto-continue) (auto-continue), #119 (Today's layout harness), #326 (VoiceOver at the end of P1).

## TL;DR
- The countdown digits fit inside the ring for "H:MM:SS" as well as "MM:SS". TimerRing sizes its digits by character count.
- Today's ring layout gets token gaps between its rows, so the ring never touches the status line or the controls.
- A layout check measures those gaps at every Today size and state, so a crowded layout fails CI instead of passing as "no scroll".
- After the first manual "+10 min", Today shows a one-time quiet line pointing to *Keep going automatically* in Settings › Timer (owner, 2026-11-12).

## Change in a nutshell
The owner reported four issues from the running app:

1. **Deep Work digits overflow the ring.** "1:28:36" runs past the ring's edge at 900×600 and in the Focus window.
2. **Pause and End touch the ring** in small windows while a session runs.
3. **Idle and "Session ended." are crowded at 900×600 and smaller.** The summary, the status line, the ring and Start/Just 2 minutes sit nearly on top of each other, and the buttons almost touch the ring.
4. **"Keep going automatically" is hard to find.** It is only in Settings › Timer.

After this change, at 900×600 during a Deep Work focus:

```
        Deep Work · 90 / 15            ⤢
   ─────────── space-4 ───────────
          Deep focus · ends 15:40
   ─────────── space-4 ───────────
               ╭───────╮
             ╱   FOCUS   ╲
            │  1:28:36    │   ← digits inside the circle
             ╲   14:12   ╱
               ╰───────╯
   ─────────── space-4 ───────────
            (⏸)      [■ End]
```

After the first "+10 min" on this device, with auto-continue off, the status line reads *You can keep going automatically in Settings › Timer.* with an **Open settings** button. It never appears again on this device.

## Problem
Spec C sized the fluid digits for "MM:SS". It gave Today's ring layout a grid with no row gap. Both were checked only for "no scroll, no overflow". E then added 90-minute presets, which show "H:MM:SS", and two-line status rows, which take room from the ring. The result is a layout that passes its harness but looks broken. E's opt-in auto-continue also has no entry point outside Settings, so people who would want it never find it.

## Causes on main (checked 2026-11-12, `14ae154`)
1. `packages/ui/src/components/ui/timer-ring.tsx:50-54`: the fluid digits are `clamp(timer-md, 23cqi, timer-xl)`, the large numeric ring uses `min(timer-xl, 30cqi)`, and the default is `min(timer-lg, 23cqi)`. In mono, five characters take about 5 × 0.6 em, so "MM:SS" at 23cqi is about 69cqi wide. Seven characters ("1:28:36") are about 97cqi, wider than the circle's inner chord.
2. and 3. `apps/orasenda/src/features/today/today.css:16-24`: `.today` (the ring layout) sets `grid-template-rows` but no `row-gap`. Only the stacked strip has one (`space-2`, line 28). The fluid ring takes `min(100cqi, 100cqb)` of the `1fr` time track (`timer-ring.tsx:57`), so it fills the track edge to edge. Its top meets the status row and its bottom meets the controls row.
4. The switch is the "Keep going" row in `apps/orasenda/src/features/settings/sections/CadenceRows.tsx:157-194`. Nothing on Today or the Focus window mentions it.
- Harness: `verification/layout/support/today.ts:83-130` (`expectTodayFits`) checks scroll, primary in view, the status row's height, 44px targets and overflow. It does not check the space between rows.

## Goals / Success criteria
1. **Digits fit.** At every size in Today's size set (`verification/layout/support/today.ts:6-17`) and in the Focus window's size set (`verification/layout/focusWindow.spec.ts:10-17`) that uses the ring layout, and in the TimerRing specimens, the digits box for "1:29:59" lies inside the ring's inner square (the circle's inscribed square, inset by the stroke), except in fluid rings where the `timer-md` floor binds (about 160–190px), where it lies inside the inner circle. "25:00" keeps today's size on every path (23cqi) and lies inside the inner circle. The digits are never smaller than `timer-md`. *(Controller ruling, 2026-11-12, #379: the inscribed square was too strict for "MM:SS" at its current size and for the floor-bound long face.)*
2. **Gaps on Today (ring layout).** Between each pair of neighbouring boxes, in order (top row, status line, ring, controls), the vertical gap is at least `space-4`, or `space-3` when the window is compact (narrower than `layout-compact-width`). This holds at every ring size in Today's size set and in every state in `STATES`, including a two-line status row and "Session ended.". The boxes are the visible box of each: the ring's SVG, the status line's text and buttons, and the controls' buttons.
3. **Gaps on Today (strips).** The strip keeps at least `space-4` between columns. The stacked strip keeps at least `space-2` between rows. Both are measured by the same check.
4. **Nothing else regresses.** There is one primary action per state, there is no scroll, `expectTodayFits` stays green at every size and state, and targets stay at 44px.
5. **Hint.** The hint appears once per device, after the first successful manual extension while *Keep going automatically* is off. **Open settings** opens Settings › Timer with the "Keep going" row in view and focused.

## Non-goals
- Any change to the Focus window's or the floater's layout beyond the digits, which come from TimerRing.
- A hint in the Focus window or the floater, since the hint is Today only.
- New tokens. `space-2`, `space-3` and `space-4` already exist (`packages/tokens/tokens.json:94-96`).
- A general hints framework. F's welcome lines can reuse the same `meta` flag pattern; F decides that.
- Screenshots in PRs. The owner checks visuals by eye.

## Users & permissions
A single local user. No roles.

## Tenancy & localization
n/a: one local user. The English copy is plain. The digits are the same in every locale.

## Domain model
- **Keep-going hint:** a one-time status line on Today. Its "shown" state is a device-only flag in the existing `meta` table (`crates/store/src/repo/meta.rs`, ADR-012), under the key `hint.keep_going`. There is no migration. *(Author's call: device-only, so a second Mac shows it once too. A hint is about this device's habits, not synced data.)*

## Interfaces

### TimerRing (packages/ui)
- The digits element gains `data-length="short" | "long"`. "long" means more than five characters ("1:29:59").
- Each size path (fluid, full, default) uses a smaller `cqi` factor for "long", so goal 1 holds. The builder picks the factors. The only requirement is goal 1's inner-square check, made with each path's own stroke. The fluid path keeps its `timer-md` floor. The factor is a literal number of `cqi` inside the component's existing style object, as today, not a new token. The README (`timer-ring.md`) states the rule ("digits fit inside the ring for up to seven characters").
- Specimens: `timer-ring-fluid-long` (400×400, "1:29:59"), plus "1:29:59" frames at the smallest and largest fluid sizes in the specimen's size list.

### Today grid (app)
- In `today.css`, the ring layout (`.today` without a `data-layout` override) gets `row-gap: var(--space-4)`, and `var(--space-3)` under `[data-compact]`. The fluid ring shrinks to the smaller time track by itself, through its existing container query.
- If a size can't give the ring at least `timer-min-size` once the gaps are added, `timerLayout` already moves it to a strip (the ring needs `layout-ring-min-height`, which is 360). The gap check proves this at every size.

### Layout harness (verification)
- A new `expectTodayGaps(page, size)` in `verification/layout/support/today.ts`. It reads the bounding boxes from goal 2 by `data-slot` and fails with a list such as `"ring→controls 4px < 12px at 640x480 running"`. `today.fits.spec.ts` runs it beside `expectTodayFits` for every size and state.
- New scenarios in `apps/orasenda/src/dev/layout/scenarios.ts`: `runningDeep` (Deep Work, "1:29:59") and `endedTwoLine` (ended with a two-line status). The Today and Focus window specs check that the digits are inside the ring for `runningDeep`.

### Keep-going hint (service, IPC, Today)
- **Pending in memory.** The timer service keeps a `hint_pending` flag in memory. It is set by a successful manual `timer_extend` (from the warning, or from a break, which returns to that open focus) while `autoContinue` is off and the `meta` key `hint.keep_going` is absent. The service reads the key once at startup and caches it. The flag clears when that focus ends (completes or is stopped), when `autoContinue` turns on, or when the hint is marked shown. It is never persisted, so a restart mid-focus drops it. *(Author's call.)*
- `TimerView` gains `hint: "keepGoing" | null`, which is `"keepGoing"` while the flag is pending.
- **Shown means rendered on Today.** When Today first renders the hint line, it calls the new command `hint_shown({ hint: "keepGoing" })`. Rust then writes the `meta` key, clears the flag and re-emits the view. The line stays on screen until the next view without it, or until the user clicks **Open settings**. If the user never sees Today during that focus, the hint can come back after a later extension. *(Author's call: "once" counts sightings, not extensions.)* The new command is added to Today's capability file and to the exact capability list in `lib_tests.rs`.
- Today's status line shows it at the lowest rank. Any error, store line, warning, notice, offer, check-in or intent line outranks it. When outranked, it waits until the row is free while the hint is still on the view.
- The text is *You can keep going automatically in Settings › Timer.* There is one ghost button, **Open settings**, whose accessible name is "Open Timer settings". The tone is neutral and the live region is polite, like the other neutral lines.
- `SettingsTarget` gains `"keepGoing"`. Navigating there opens Settings › Timer, scrolls the "Keep going" row into view and focuses its checkbox.

## Behavior & edge cases
- **Digits:** "MM:SS" keeps its current size, so nothing changes for 25-minute sessions. The face switches between "short" and "long" only when the text length changes, at 59:59 → 1:00:00 (an extension past 60 minutes) or the reverse.
- **Status row in two lines:** the row grows (`minmax(hit-min, auto)`), the time track shrinks, and the gaps stay.
- **The hint while the timer is unavailable or the store has failed:** there is no hint, because a failed startup read counts as "already shown". If the `hint_shown` write fails, the flag still clears for this run, and the failure is logged through the existing store error path. The hint may then return in a later run.
- **An empty status row:** the gap check skips it, and its neighbours are compared directly. The 44px track between them still keeps the gap.
- **Open settings:** Settings is a page in the main window, so `onNavigate("settings", "keepGoing")` navigates in place.
- **Extension from the Focus window or the floater:** the hint is set on the view, and Today shows it the next time it is visible during that focus.
- **Reduce motion:** nothing animates.

## Data & migrations
No schema change. One new `meta` key, `hint.keep_going`, whose value is the RFC 3339 time it was shown.

## Testing strategy
- **packages/ui:** unit tests for `data-length`. The timerRing layout spec checks goal 1 at every specimen size: "1:29:59" inside the inner square (the inner circle where the floor binds), "25:00" inside the inner circle, and the font size ≥ `timer-md`.
- **verification:** `expectTodayGaps` runs at every size and state in `today.fits.spec.ts`, plus the `runningDeep` digits check on Today and in `focusWindow.spec.ts`. The existing `expectTodayFits` and the focus, motion and popover specs stay green.
- **Rust:**
  - service tests: a manual extend sets the pending hint; `hint_shown` writes `meta` and clears it; after the write, a later extend doesn't set it; it isn't set when `autoContinue` is on, or for an automatic step; it clears at the focus's end; a failed startup read means no hint;
  - the `lib_tests.rs` exact capability list includes `hint_shown`.
- **Webview:** `statusLine` tests for rank (outranked by a warning, the offer and errors), Today tests for calling `hint_shown` once on first render, Today tests for **Open settings** navigating to `keepGoing`, and a Settings test for scroll and focus on the row.
- **Owner by eye, both themes:** Today at 360×640, 640×480, 900×600 and 1280×800 in idle, running Deep Work, paused, "Session ended." and a two-line status; the Focus window at 1280×720 and 390×844 running Deep Work; the hint line at 900×600.

## Decisions
- Owner, 2026-11-12: the keep-going entry point is a one-time hint after the first extension (over a popover row, or no change).
- No ADR: only this spec depends on these choices. No new CONTEXT.md terms beyond **keep-going hint**, which is added there.

## FAQ
### Why size the digits by character count rather than measuring the text?
Measuring takes a resize observer on every tick or a layout pass. The character count is known from the string, and mono digits have a fixed width per character, so a factor per length is exact enough and costs nothing.

### Why a gap token rather than a smaller ring cap?
The ring already shrinks to its track. The crowding comes from zero space between tracks, not from the ring's size. A gap fixes every state at once and is measurable.

### Why put the hint on `TimerView` rather than in the webview?
Rust already owns when an extension happens, from any window, and it owns the store. The webview only reports that Today showed the line, so "shown once" means the person saw it.

## Open questions
None.

## Implementation status
- Plan: [docs/plans/2026-11-12-today-timer-polish.md](../plans/2026-11-12-today-timer-polish.md)
- [ ] P1 TimerRing digits (#379)
- [ ] P2 Today grid gaps and the gap check (#381)
- [ ] P3 The keep-going hint (#380)
