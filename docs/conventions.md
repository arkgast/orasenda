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

## Code structure (ADR-001, ADR-007)
- `crates/core` holds product logic. It never depends on `tauri`, `tao` or `wry`, never uses
  `cfg(target_os)`, and never calls `SystemTime::now()`: time is passed in.
- Every new Rust dependency of core must `cargo check` for `aarch64-apple-ios` and
  `aarch64-linux-android`. `scripts/ci.sh` enforces it.
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
