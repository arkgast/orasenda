# Orasenda: Roadmap

> Derived from [SPEC.md](SPEC.md). Each phase ships something usable and ends with a dogfooding week and a retro.

## Phases

| Phase | Name | Scope | Exit criteria |
|---|---|---|---|
| **P0** | Foundations | Tech decisions recorded in `DECISIONS.md` (stack, storage, distribution, blocking approach), with a **spike** proving foreground-app detection and an overlay on macOS. Design pass in Claude Design: tokens, Today, Timer, Board, Full-screen. Repo, CI and lint set up. | Decisions approved, spike works, design tokens ready |
| **P1** | Focus Core | Timer presets, menu-bar and mini timer, 2-minute start, flow extension, capture pad, 2-minute warning, full-screen, deep-hours cap, local store, export, import, automatic backups | Usable daily as a focus timer |
| **P2** | Tasks | Kanban with WIP limits, Deep/Shallow, estimates with buffer, time per task, breakdown prompt, Frog, quick-add hotkey | Every session is linked to a task, with estimated vs actual time |
| **P3** | Plan the Day | Built-in calendar, drag-to-block, overflow block, block-starts-session prompt, energy-aware suggestions, realistic finish time, reshuffle, onboarding | Full day planned and executed in the app |
| **P4** | Routines and Reviews | Unified routines and habits, 5 templates with disclaimers, daily shutdown, weekly review and plan, neutral stats | One week of use with reviews completed |
| **P5** | Awareness | Opt-in usage tracking with every privacy control, categories, per-session switches, weekly distraction insights | Trustworthy local tracking |
| **P6** | Protection | Blocking profiles, Gentle and Firm, safety allowlist, browser fallback, guided Focus filter setup, contextual permissions | Blocking works without being trivially bypassed |
| **P7** | Web Extension and Strong Lock | Browser extension for domain tracking and blocking, strong lock with an anti-quit helper, interruption analytics | Websites covered |
| **P8** | Sound and Recovery | Noise generator and ambiences, binaural option, NSDR audio, brief-rest cue (experimental) | |
| **P9** | Music Integration | Local library and playlists, royalty-free sources, optional yt-dlp personal plugin | |
| **P10** | Sync and Multi-platform | Accounts, end-to-end encrypted sync, web app, iOS and Android, external calendars, body-doubling and status sharing, template gallery, public launch prep | Public beta |

**Note:** P1–P4 make a complete, useful product with no system permissions at all, so they are a safe base before the risky macOS work in P5–P7.

## How we proceed
1. **Done:** the spec docs are written (`docs/SPEC.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `README.md`).
2. **Design:** take SPEC sections 1–3 into Claude Design for tokens and key screens.
3. **Tech phase (P0):** a focused session that produces decision records for the stack, storage, distribution and blocking approach, plus the macOS spike.
4. **Backlog:**
   - turn each roadmap phase into a GitHub milestone with small issues (user stories plus acceptance criteria taken from SPEC.md);
   - the baton skills available here (`baton:plan` → `baton:backlog` → `baton:implement` → `baton:verify` → `baton:review`) can run this loop once the repo is set up (git and `.baton/config.json`).
5. **Build phase by phase:** each phase ends with a short dogfooding week, using the app on ourselves, and a retro before starting the next.

