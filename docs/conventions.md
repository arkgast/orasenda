# Orasenda: Conventions

Project rules for every contributor and agent. They override baton's general guides.
`baton:retro` adds lessons here over time. Source of truth for product intent: [SPEC.md](SPEC.md).

## Product principles in code
- **Calm by default.** One primary action per screen. No badges, red alerts, feeds or
  attention-grabbing animation. Copy is neutral and kind: never shame the user.
- **The user is in control.** Every block, rule and tracked category is opt-in and chosen by the
  user. Strong locks are opt-in and described honestly as friction, never as unbreakable.
- **Private by design.** Data stays on the device. Tracking records only the app or domain and its
  duration: never keystrokes, screenshots, window titles or page content. No telemetry without an
  explicit opt-in.
- **Accessible.** State is never shown by color alone. Every feature works by keyboard and with
  VoiceOver. Time stays visible.
- **Honest wellness claims.** Weakly supported practices are labeled *optional* or *experimental*.
  Wellness suggestions say they are not medical advice.

## Process
- Architecture decisions go in [DECISIONS.md](DECISIONS.md) as ADRs before the code that depends
  on them.
- All checks live in the `ci` recipe of the `justfile`; `scripts/ci.sh` runs `just ci`, and baton
  `validate` and GitHub Actions both run that script. Add new checks to the recipe, fastest first.
- Every task issue, whether a plan task or a follow-up filed from a review, lists Owns and
  Touches. Touches name every file outside Owns that its change or its tests need: the
  TypeScript tests that build an IPC type it changes, the test hooks it needs in another crate,
  and the spec line for a failure case it settles. Three P1-A tasks (#87, #91, #104) each needed
  an architect ruling for an ownership exception: the plan left a file out of #87 and #91, and
  #104, a review follow-up, had no Owns or Touches at all. In P1-B, T4 (#145) changed a managed
  state type from a unit struct. That forced a one-line `.manage(...)` edit in `lib.rs`, which the
  parallel T5 (#146) owned, and needed a ruling
  (https://github.com/arkgast/orasenda/issues/145#issuecomment-6755881829). So a task that adds or
  reshapes a managed or registered type lists the file with the registration line in Touches.

## Code structure (ADR-001, ADR-007)
File size and module layout rules are in [Code structure and size](#code-structure-and-size).
- `crates/core` holds product logic. It never depends on `tauri`, `tao` or `wry`, never uses
  `cfg(target_os)`, and never calls `SystemTime::now()`: time is passed in.
- Every new Rust dependency of core must `cargo check` for `aarch64-apple-ios` and
  `aarch64-linux-android`. `scripts/ci.sh` enforces it on macOS only.
- `apps/orasenda/src/bindings.ts` and `packages/tokens/tokens.css` are generated. Never
  edit them by hand; regenerate and commit.
- Every new Tauri command is added to the `AppManifest` list in `build.rs` and granted in a
  capability. Commands not listed there are open to every window.
- Accessibility lint errors (Biome `a11y` group) block, like any other error.
- OS code lives only in `crates/platform-<os>` (ADR-010). Core never depends on `objc2`,
  `windows` or another OS crate; the app crate is the only place that picks an implementation.
- `NSWindow`, `NSApplication` and `NSScreen` calls and observer registration run on the main
  thread (`MainThreadMarker`); never hold a lock across an AppKit call.
- Spike code runs only behind `spike::enabled()` (debug build and `ORASENDA_SPIKE=1`).
- Time strings are formatted in Rust; the webview never computes time (ADR-011). The one
  exception is spike code (`formatClock` in `format.ts`).
- `crates/store` is the only crate with SQLite; `just core-boundary` rejects `rusqlite` elsewhere
  in core.
- Device-only tables never write `change_log`; a repository says which it is in its module doc
  (ADR-012).

## Code structure and size
Rules from the [structure refactor spec](specs/2026-11-10-structure-refactor.md).
1. **Size.** A tracked source file (`.rs`, `.ts`, `.tsx`, `.js`, `.css`) is at most 500 lines,
   tests included. Generated files are exempt (`apps/orasenda/src/bindings.ts`,
   `packages/tokens/{tokens,theme}.css`, `dist/`, `gen/`). `just file-size` runs in `ci`.
   Files that predate the rule sit in `scripts/file-size-allowlist.txt` with their line count.
   The guard fails when a listed file grows, when a listed file is back under 500 (remove its
   entry), or when an unlisted file passes 500. The list only shrinks.
2. **Layering.** `core` has no I/O. `store` is the only crate with SQLite. `service` never
   depends on `tauri`, `tao` or `wry`. Adapters hold no business rules: a command parses, calls
   the service, and maps the result.
3. **Folders.** A Rust module becomes a folder (`foo/mod.rs`) once it has more than one part.
   Rust tests live in `tests.rs` or `tests/` beside their module, with shared fixtures in one
   `support` module. Frontend code lives by feature; tests sit beside their file and split by
   behaviour.
4. **The store hides its driver.** No `rusqlite` type appears in the store's public API or in
   `service`. Repositories take the store's own `Txn`. Write new store code so another backend
   could sit behind the same API; don't build that backend.
5. **A refactor PR moves code or changes it, never both.** A move keeps public paths working
   with re-exports until every caller is updated in the same PR.
6. **Plans split before they grow.** A task that would push a file past 500 lines includes the
   split, and its Owns lists the new sibling files.

## Failures are never silent success
Seen three times in the P1-A wave 2 reviews: `PRAGMA journal_mode = wal` answered and ignored
(#89), an unknown `UNAuthorizationStatus` mapped to `Granted` (#90), and a failed
`settings_get` only logged while the page silently hid the presets (#92).
- An unknown value from the OS, the store or IPC maps to the failure side (`Unavailable`, an
  error), never to the success one. List the known success values explicitly; the `_` arm is
  the failure.
- When a call answers with what actually happened (a pragma, a completion handler, a status),
  check the answer. Ignore it only on purpose, with a comment saying why.
- A failure in a surface is logged and shown: one plain failure line in the slot the feature
  would fill (ADR-013), or a rollback to the last state the store accepted. Logging alone is
  not handling.

## Newest wins, not last to arrive
Seen twice in P1-A: Today rolled back over a later settings save that was still in flight
(#101), and the menu bar drew a stale running view after a newer stop (#93).
- Work computed under a lock and applied after unlock, or replies to calls that can overlap,
  can arrive out of order. First, stop the overlap: if the caller can wait for the last call to
  answer, chain the calls so at most one is in flight, and send the newest intent when it
  answers. Chaining also fixes the order the other side applies them in. Today's first fix
  (#101) used sequence numbers. It dropped an older write failure because a newer save was
  rejected, so the screen kept a value Rust never saved, and Rust could still apply overlapping
  saves in either order. Chaining (#115) fixed both.
- Use a sequence number only when the calls cannot be chained, such as views published by both
  the scheduler thread and commands, which no single caller can wait on (#93). Stamp each result
  with a number taken where it was computed (under the lock, or when the call was sent) and drop
  anything older than the last one applied.
- Check-and-apply happens under one small mutex (not an atomic) that is never held while
  waiting on the main thread.
- Test it with two threads (or two pending promises) forced into the stale order with barriers
  or held replies, never with sleeps.

## Design-system changes are checked against their first consumer
Seen twice in P1-B. T1's review approved the T1 design-system task (#142, PR #152), but the first
page built on it (T6, #147) needed two contract changes. `SettingsRow` had no stable ids, so a
control inside it could not point `aria-describedby` at its helper and status line; this was fixed
in a second round of #152 (ruling on #142). `Input` rendered its error as `role="status"`, a second
live region on a page whose spec allows exactly one (#157, PR #159).
- A design-system task's review reads the consuming spec's accessibility acceptance (live regions,
  labels, `aria-describedby`, focus). It checks every new or changed component against that
  acceptance, not only against its own README.
- A field's error is never a live region: it links to its control with `aria-describedby`, and the
  page's status component announces the change. Any other component adds a live region of its own
  (`role="status"`, `role="alert"`, `aria-live`) only when its README names one, as `AppRow` does
  for a failed save.
- An id that another element must reference is settable by prop, so the consumer can pass it in.
