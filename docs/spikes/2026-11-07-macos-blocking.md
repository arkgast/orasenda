# macOS detection-and-overlay spike — Findings

- Date: 2026-11-08
- Spec: [docs/specs/2026-11-07-macos-blocking-spike.md](../specs/2026-11-07-macos-blocking-spike.md)
- Task: #18 (S7). Follow-up: #61 (pre-beta matrix pass).
- Decisions: [ADR-004](../DECISIONS.md#adr-004-macos-app-blocking-approach) and [ADR-005](../DECISIONS.md#adr-005-macos-usage-tracking-approach-and-permissions), accepted from these findings.

## Summary
- Detection with `NSWorkspace` notifications works for every switch method tried, with no permission.
- The Tauri overlay shows above full-screen apps **only** as a non-activating panel. `NonActivatingPanel` is now the default.
- The overlay shows within 46 ms of the notification (median 9–12 ms), far below the 500 ms target.
- Hide and Close work. Back to focus has one open edge case (#59).
- Orasenda never appears in Privacy & Security and never prompts.
- Idle closes the open segment. CPU stays well below 1 %.

## Environment
- MacBook Pro, Apple M4 Max, 48 GB; macOS 27.0.1 (build 26A434).
- The spike bundle: `pnpm --filter orasenda tauri build --debug --bundles app` with `src-tauri/tauri.spike.conf.json`. Ad-hoc signed (`Signature=adhoc`, identifier `com.veloud.orasenda`), hardened runtime.
- Launched with `open -n --env ORASENDA_SPIKE=1 …/Orasenda.app`, or by running the bundle's executable directly with `ORASENDA_SPIKE=1`. Logs come from the bundle's stderr.
- Run by the owner on 2026-11-08, across several sessions (including the #56 and #57 retests).

## Method: a reduced matrix
The owner chose a reduced matrix to close P0:
- Only the rows needed to decide ADR-004 and ADR-005 were run.
- They were run once, in the Launch Services spike bundle. Nothing was run under `tauri dev`.
- Timings are informal samples from the log, not the protocol of 10 per layout.
- The other rows are deferred to a pass before the private beta: **#61**.

## Matrix
Row numbers match the spec's [Testing strategy](../specs/2026-11-07-macos-blocking-spike.md#testing-strategy).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Detection by ⌘Tab, Dock click, window click, Alfred, Mission Control, Space swipe | Pass | The overlay appeared every time, and each switch is in the dev panel's Recent usage. Mission Control and the swipe were seen during the #56 retests. Spotlight was not tried on its own (#61). |
| 2 | Target in a normal window | Pass | Both strategies show above it. |
| 2 | Target full screen on its own Space | Pass with `NonActivatingPanel` | `LevelAndCollection` fails: see [Overlay strategy](#overlay-strategy). |
| 2 | Timing | Pass | 2–46 ms, see [Timings](#timings). |
| 2 | Space unchanged | Pass | With `NonActivatingPanel` over full-screen Firefox, the Space stays the same. |
| 2 | Escape without a click | Pass | Owner, in an earlier session; re-checked with the panel in #61. |
| 2 | Stage Manager | Deferred | #61 |
| 2b | Second display | Deferred | #61 |
| 3 | Back to focus, Hide mode, windowed and full screen | Pass, one open case | See [Back to focus](#back-to-focus). |
| 3 | Back to focus, Close mode | Pass | Targets quit normally. An app with unsaved changes shows its own save dialog; Orasenda forces nothing. |
| 4 | Continue | Pass after #57 | Continue works. Re-ticking the app after Continue did not block it again; fixed by #57 (PR #58). The full row 4 sequence is deferred (#61). |
| 4b | Back to focus lands in the previous app | Pass, informally | Via ⌘Tab, the Dock and (after #56) Mission Control. Formal run deferred (#61). |
| 5 | Safety allowlist; Orasenda itself | Deferred | #61 |
| 6 | Privacy & Security; any prompt | Pass | Orasenda is absent from Accessibility, Screen Recording, Input Monitoring and Automation. No prompt at any time. |
| 7 | Keyboard only; VoiceOver | Deferred | #61 |
| 8 | Idle, then input | Pass | See [Idle](#idle). |
| 9 | CPU over 5 minutes | Pass | See [CPU](#cpu). |
| 10 | Flag off; release build | Deferred | #61. The flag-off case in a debug build is covered by the `spike_disabled_without_flag` test. |
| 11 | Light and dark | Deferred | #61 |
| 12 / 12b | Another app, or another target, while the overlay is open | Deferred | #61 |

## Overlay strategy
- **`LevelAndCollection`** (the first default) shows above windowed apps. It does **not** show above a full-screen app: the overlay appeared on another Space (to the left), the user was not moved to it, and full-screen Firefox stayed usable.
- **`NonActivatingPanel`** shows above full-screen Firefox on its own Space, and above windowed targets too. The Space does not change.
- **`AccessoryPolicy`** is built but was not needed, so it was not tested.

**Winner: `NonActivatingPanel`.** It is now the default in `apps/orasenda/src-tauri/src/spike/overlay.rs`. The Tauri overlay is viable; no native AppKit overlay is needed.

The panel swap drops tao's window-class overrides. No lost behavior was noticed in this run: Back to focus and Continue work from the panel. Escape was checked in an earlier session, before the strategy was recorded per session, so it is re-checked with the panel in #61 along with keyboard and VoiceOver.

## Timings
`spike: overlay N ms`: from the activation notification to `show()` returning.

| Strategy | Samples | Median | Min | Max |
|---|---|---|---|---|
| `LevelAndCollection` (one session) | 27 | 9 ms | 1 ms | 46 ms |
| `NonActivatingPanel` (sessions before #56's fix) | 41 | 12 ms | 3 ms | 40 ms |
| `NonActivatingPanel` (#56 retest) | 16 | 11 ms | 2 ms | 28 ms |
| `NonActivatingPanel` (all) | 57 | 12 ms | 2 ms | 40 ms |

An earlier `LevelAndCollection` session (on #18) logged 10 more samples, from 0 to 18 ms.

All samples are far below the 500 ms target. They are informal: layouts were mixed, not 10 per layout. The protocol run is in #61.

## Back to focus
- **Hide mode** hides the target and returns to the previous app, via ⌘Tab and the Dock, for windowed and full-screen targets.
- **Mission Control to a full-screen target** looped: Back to focus showed the overlay again. Fixed by #56 (PR #60, in review when this was written): when the app already reports hidden, Orasenda unhides it, then hides it. Confirmed on the owner's hardware.
- **Trackpad swipe to a full-screen target:** Back to focus leaves you on that Space. Open as #59. It does not block ADR-004.
- **Close mode** quits targets normally. Apps with unsaved changes show their own save dialog, and Orasenda does not force anything. Close mode stays.
- On macOS 27, `hide` returns NO even when it hides (#41, [common issues](../common-issues.md)). The log notes it and moves on.
- **Observation:** when Orasenda itself was full screen, Back to focus landed on the desktop rather than on Orasenda's Space. A nice-to-have, tracked in #61.

## Continue
Continue closes the overlay and lands in the target. After Continue, ticking the app again did not block it; #57 ends the allowance when the allowed app's rule changes (PR #58, merged).

## Permissions
Orasenda is absent from Privacy & Security → Accessibility, Screen Recording, Input Monitoring and Automation. No prompt appeared at any time: not for detection, hiding, closing, idle time or the overlay.

This was the ad-hoc-signed bundle launched by Launch Services, so macOS attributed any prompt to Orasenda itself, not to a terminal. A Developer ID-signed, notarized build is re-checked before the private beta (ADR-004, #61).

## Idle
The dev panel showed:

```
Safari · 16:12–16:13
idle   · 16:13–16:19
Safari · 16:19–16:19
```

The Safari segment closed when idle started, and a new one opened on return.

## CPU
With the flag on and no overlay showing, `top` took 60 samples over 5 minutes: 0.22 % average, 2.0 % max (one spike). The owner's own run showed 0.1 %. The target is below 1 % on average.

## Phone app
The Phone app's bundle ID is `com.apple.mobilephone`, from the setup log line `spike: setup done … extra allow Some("com.apple.mobilephone")`.

## Other feedback
- The `IntentPrompt` flow and button hierarchy are confusing: #55.
- The 24-hour clock setting is not honored (a known WKWebView limitation, P1); see #30.

## Deferred to #61
- Row 1, partly: Spotlight, Mission Control and a Space swipe, each recorded on its own.
- Row 2: Stage Manager, and the timing protocol (10 samples per layout).
- Row 2b: second display.
- Rows 4 and 4b, run formally.
- Row 5: the safety allowlist and Orasenda itself.
- Row 7: keyboard and VoiceOver, on the overlay and the dev panel.
- Row 10: flag off and a release build.
- Row 11: themes for the overlay and the panel.
- Rows 12 and 12b.
- The notarized, Developer ID-signed re-check.
- The full-screen-Orasenda observation above.

## Conclusions
- **ADR-004 (blocking):** accepted. Detect with `NSWorkspace` notifications, show the overlay as a non-activating panel through Tauri's window, and hide or terminate with `NSRunningApplication`. Close mode stays. The anti-quit helper stays open for its own spike before P7.
- **ADR-005 (tracking):** accepted. Option 1 is confirmed: no permission, CPU well below 1 %, and idle closes the open segment.
