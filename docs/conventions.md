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
