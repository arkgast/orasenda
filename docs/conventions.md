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
- All checks live in `scripts/ci.sh`. baton `validate` and GitHub Actions both run it; add new
  checks there, fastest first.

## Code structure (ADR-001, ADR-007)
- `crates/core` holds product logic. It never depends on `tauri`, `tao` or `wry`, never uses
  `cfg(target_os)`, and never calls `SystemTime::now()`: time is passed in.
- Every new Rust dependency of core must `cargo check` for `aarch64-apple-ios` and
  `aarch64-linux-android`. `scripts/ci.sh` enforces it.
- `apps/orasenda/src/bindings.ts` and `apps/orasenda/src/styles/tokens.css` are generated. Never
  edit them by hand; regenerate and commit.
- Every new Tauri command is added to the `AppManifest` list in `build.rs` and granted in a
  capability. Commands not listed there are open to every window.
- Accessibility lint errors (Biome `a11y` group) block, like any other error.
