# Deterministic running_apps tests on macOS — Spec

- **Status:** draft
- **Date:** 2026-11-19
- **Owner:** the product owner (approach picked 2026-11-19)
- **Related:** `crates/platform-macos/src/control.rs`; precedent `crates/platform-macos/src/foreground.rs:113`

## TL;DR
- Two macOS tests fail whenever launchservicesd reports no Regular apps to a new process: `running_apps_contains_regular_apps` and `running_apps_runs_off_main_thread`. That state comes and goes outside our code.
- The filtering and mapping in `MacAppControl::running_apps` moves into a pure function over app snapshots. Unit tests cover it with fake snapshots.
- The live tests that always run keep calling the real API, including off the main thread. They assert only invariants that hold for any list, including an empty one.
- The "at least one Regular app" check moves to an `#[ignore]`d live test, run by a new `just live-macos` recipe. When it fails, it prints the app counts by activation policy.
- The landing workaround `--skip running_apps_` is removed from the session pipeline's `land.sh` and from the working-style memory.

## Change in a nutshell
`cargo test --workspace --locked`, which `baton verify` runs through `./scripts/ci.sh`, no longer depends on which apps launchservicesd reports. Checking against a live desktop becomes a deliberate step:

```
$ just live-macos
running 1 test
test control::tests::live_running_apps_lists_regular_apps ... ok
```

## Problem
Since 2026-11-18, `cargo test` has often failed in fresh test processes on `assert!(!apps.is_empty())` (`control.rs:228`, `control.rs:334`). Each landing has to skip both tests by hand, which also skips coverage of the real call.

What the investigation found (2026-11-19):
- The failing runs also ran `hide_non_regular_app_is_not_a_regular_app`, and it passed. That test needs `runningApplications` to return at least one non-regular app (`control.rs:247-253`). So the list was not empty; none of its entries reported `NSApplicationActivationPolicy::Regular`.
- One failure was at 07:39 local time, 9 minutes after loginwindow logged the screen unlocked (the session back to "desktop showing"). launchservicesd took the connection normally, and no sandbox denial was logged.
- The tests did not fail when idle, locked, or in an agent session:
  - 49 minutes idle, including 19 minutes with the screen locked: 298 runs, all passing.
  - In this agent session, whose shell is in a `Background` launchd session, they pass too.
- The cause sits in launchservicesd's state, outside the process, and we can't reproduce it on demand. A unit test can't depend on it.

## Goals / Success criteria
1. `cargo test --workspace --locked` gives the same result whether launchservicesd reports Regular apps or not. No test in the default run asserts that the live list is non-empty.
2. The filter, keeping Regular apps only, and the mapping to `AppRef` are unit-tested with fake snapshots. The fakes include:
   - a list with no Regular apps, giving an empty result;
   - a mixed list, keeping only the Regular entries in order;
   - the name fallback in `app_ref` (`control.rs:137-151`): first the localized name when it isn't empty, then the bundle id, then `pid <n>`.
3. A default-run test still calls the real `MacAppControl.running_apps()` on the test thread and on a spawned thread. It asserts that every returned app is Regular, has a non-empty name and is not `com.apple.dock`, as the current loop at `control.rs:229-243` does.
4. `live_running_apps_lists_regular_apps` is `#[ignore = "needs launchservicesd to report Regular apps; run with just live-macos"]`:
   - It asserts at least one Regular app, both on the test thread and on a spawned thread.
   - When it fails, it reports the total and the counts of Regular, Accessory and Prohibited apps.
5. `just live-macos` runs the ignored live tests of `orasenda-platform-macos`. That includes the existing `frontmost_returns_some`.
6. The session pipeline's `land.sh` and `working-style.md` no longer skip `running_apps_`. Neither file is in the repo: the controller edits both after the merge, not in the PR.

Author's calls, from the builder check:
- **Scope is the two `running_apps_*` tests.** `hide_non_regular_app_is_not_a_regular_app` also reads the live list. It needs a non-regular app, and the system always runs one (the Dock, loginwindow and others). It passed in every failing run on record, so it stays as it is. If it ever fails, it gets the same treatment in its own task.
- **`just live-macos` runs every ignored lib test in the crate on purpose.** Today that's `frontmost_returns_some` and the new live test. Any later live-session check in this crate belongs there too.

## Non-goals
- Finding or working around the launchservicesd behaviour itself. The app calls the real API at runtime, and a picker with no apps is an existing empty state.
- Changing `AppControl` in `orasenda-core`, or the spike fakes in `apps/orasenda/src-tauri`.
- Running the ignored tests in CI.

## Approaches
- **Seam plus an ignored live test:** deterministic verify; the real non-empty check runs only on demand.
- **Loud runtime skip:** the tests return early with a SKIPPED line when there are no Regular apps. verify still depends on machine state, and a real regression to an empty list would show up only as a skip.
- **Launch a known app first:** changes the desktop and needs a GUI session. It would likely still fail in the state we saw, where nothing is marked Regular.

Picked by the user: seam plus an ignored live test.

## Users & permissions
n/a (test code and a dev recipe only).

## Tenancy & localization
n/a.

## Domain model
Author's call: a private snapshot struct in `control.rs`, `struct AppSnapshot { pid: i32, name: Option<String>, bundle_id: Option<String>, policy: NSApplicationActivationPolicy }`. It is built from each `NSRunningApplication`. A pure `fn regular_apps(snapshots) -> Vec<AppRef>` does the filter and the mapping that `is_regular` and `app_ref` do today. The behaviour of `app_ref`, including its name fallback, is kept exactly; tests pin it before the move.

## Interfaces
- No public API change. `MacAppControl::running_apps` keeps its signature and output.
- New just recipe `live-macos`: `cargo test -p orasenda-platform-macos --lib -- --ignored`.

## Behavior & edge cases
- No Regular apps: an empty `Vec`, the same as today. That is now a tested, valid result, not a test failure.
- An app that quits between listing and checking keeps today's handling. The invariant test skips any pid that no longer resolves, as `control.rs:233-237` does.

## Data & migrations
None.

## Testing strategy
- **Tests first:** pure-function tests over fake snapshots, covering success criterion 2.
- **Invariant tests:** the real call, on the test thread and on a spawned thread (criterion 3).
- **Live test:** ignored; run with `just live-macos` (criterion 4). The developer runs it by hand when touching `control.rs`. Each PR that touches `control.rs` lists it under **Not yet verified** or **Checks**.
- **Proof that verify is deterministic:** `./scripts/ci.sh` passes, and `cargo test -p orasenda-platform-macos --lib running_apps` runs no non-empty assertion. We can't force launchservicesd into the failing state, so that state isn't tested directly; the reasoning is criterion 1.

## Decisions
No ADR: only this crate's tests depend on the choice. It follows the precedent at `foreground.rs:113` (`#[ignore]` for live-session checks).

## FAQ
### Why keep a live non-empty test at all?
It's the only check that NSWorkspace and activation policies still work against a real desktop. The pure tests can't catch an AppKit binding change.

### Why not skip at runtime?
The verify result would still depend on launchservicesd state, which is the problem this spec removes.

## Open questions
None.

## Implementation status
- [ ] Plan and issue (to be linked)
