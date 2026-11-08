# Orasenda: Roadmap

> Derived from [SPEC.md](SPEC.md). Each phase ships something usable and ends with a dogfooding week and a retro.

## Audience
First users: **people with ADHD and knowledge workers on Mac** who want a kind, private focus tool. The promise: *plan your day and protect it, without being judged or watched.*

## Releases
Phases are grouped into releases. Each release goes to real users before the next one starts.

| Release | Phases | Audience | Goal |
|---|---|---|---|
| **Private beta** | P0 + P1 + P2 | 10–20 testers from the target audience | Used daily; weekly feedback |
| **Public v1** | P3 + P4 | Public (Show HN, Product Hunt, r/ADHD, r/productivity) | Launch with donations and the supporter licence (ADR-006) |
| **v2 "Protect"** | P5 + P6 + P7 | Public | Second launch: tracking and blocking, the main differentiator |
| **v3 "Everywhere"** | P10 | Public | Paid Orasenda Sync, iOS companion, Windows, web app |
| Later | P8, P9 | Public | Sound and music, when users ask for them |

## Phases

| Phase | Name | Scope | Exit criteria |
|---|---|---|---|
| **P0** | Foundations | Tech decisions recorded in `DECISIONS.md` (stack, storage, distribution, blocking approach, licence, telemetry), with a **spike** proving foreground-app detection and an overlay on macOS. Design pass in Claude Design: tokens, Today, Timer, Board, Full-screen. Repo, CI and lint set up. **App shell:** Tauri 2 + React + Rust core, macOS gating CI, Windows advisory CI, mobile projects smoke-tested. | Decisions approved, spike works, design tokens ready, shell passes `ci` on macOS |
| **P1** | Focus Core | Timer presets, menu-bar and mini timer, 2-minute start, flow extension, capture pad, 2-minute warning, full-screen, deep-hours cap, local store (sync-ready, ADR-002), export, import, automatic backups. Split into sub-projects A–E, built A → B → (C ∥ D) → E; see [the focus session loop spec](specs/2026-11-08-focus-session-loop.md). | Usable daily as a focus timer |
| **P2** | Tasks | Kanban with WIP limits, Deep/Shallow, estimates with buffer, time per task, breakdown prompt, Frog, quick-add hotkey, **task import** (Apple Reminders on the device; Todoist and Things exports) | Every session is linked to a task, with estimated vs actual time |
| **P3** | Plan the Day | Built-in calendar, drag-to-block, overflow block, block-starts-session prompt, energy-aware suggestions, realistic finish time, reshuffle, onboarding, **read-only calendar import** (macOS EventKit and ICS files, on the device, no account) | Full day planned and executed in the app, around existing calendar events |
| **P4** | Routines and Reviews | Unified routines and habits, 5 templates with disclaimers, daily shutdown, weekly review and plan, neutral stats | One week of use with reviews completed |
| **P5** | Awareness | Opt-in usage tracking with every privacy control, categories, per-session switches, weekly distraction insights | Trustworthy local tracking |
| **P6** | Protection | Blocking profiles, Gentle and Firm, safety allowlist, browser fallback, guided Focus filter setup, contextual permissions | Blocking works without being trivially bypassed |
| **P7** | Web Extension and Strong Lock | Browser extension for domain tracking and blocking, strong lock with an anti-quit helper, interruption analytics | Websites covered |
| **P8** | Sound and Recovery | Noise generator and ambiences, binaural option, NSDR audio, brief-rest cue (experimental) | |
| **P9** | Music Integration | Local library and playlists, royalty-free sources, optional yt-dlp personal plugin | |
| **P10** | Sync and Multi-platform | Accounts, paid end-to-end encrypted sync (ADR-002, ADR-006), web app, iOS companion with Screen Time blocking, Android, Windows builds, two-way external calendars, body-doubling and status sharing, template gallery | Paying sync users on at least two platforms |

**Note:** P1–P4 make a complete, useful product with no system permissions at all, so they are a safe base before the risky macOS work in P5–P7.

## Website track
Runs alongside the phases; it must be live before the public v1 launch.

| Step | Scope | When |
|---|---|---|
| **W1** | Choose and register a domain; trademark search for "Orasenda" | Before the private beta |
| **W2** | Landing page with a waitlist (newsletter service, no own backend), privacy policy | During the private beta |
| **W3** | Website design pass in Claude Design, built from the Orasenda design system | Before public v1 |
| **W4** | `apps/website` (Astro, static) in the monorepo: downloads from GitHub Releases, docs, template articles, donation and supporter links; no third-party analytics | Public v1 |

## How we proceed
1. **Done:** the spec docs are written (`docs/SPEC.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `README.md`).
2. **Design:** done. The [Orasenda design system](https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73) holds the tokens, 23 components and the brand guide. All future screens and code build from it.
3. **Tech phase (P0):** done (2026-11-08, #62). Decision records for the stack (ADR-001), storage (ADR-002), distribution (ADR-003), business model (ADR-006), typed IPC (ADR-007), telemetry (ADR-008) and licence (ADR-009); the app shell; then the macOS spike for blocking and tracking (ADR-004, ADR-005). Still open from P0: the pre-beta matrix pass (#61) and the manual acceptance checks (#30).
4. **Backlog:**
   - turn each roadmap phase into a GitHub milestone with small issues (user stories plus acceptance criteria taken from SPEC.md);
   - the baton skills available here (`baton:plan` → `baton:backlog` → `baton:implement` → `baton:verify` → `baton:review`) can run this loop once the repo is set up (git and `.baton/config.json`).
5. **Build phase by phase:** each phase ends with a short dogfooding week, using the app on ourselves, and a retro before starting the next.

