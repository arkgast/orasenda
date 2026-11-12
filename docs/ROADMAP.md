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
| **P1** | Focus Core | Timer presets, menu-bar and mini timer, 2-minute start, flow extension, capture pad, 2-minute warning, full-screen, deep-hours cap, local store (sync-ready, ADR-002), export, import, automatic backups. Split into sub-projects A–G plus an unlettered Components sub-project, built A → B → Components → C → (D ∥ E) → F → G; see [P1 sub-projects](#p1-sub-projects) and [the focus session loop spec](specs/2026-11-08-focus-session-loop.md). | Usable daily as a focus timer |
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

## P1 sub-projects
P1 is built as eight sub-projects (seven lettered, plus Components), each with its own spec, plan and implementation cycle. The redesign (Settings, Today, Focus views) comes before session cadence. The re-cut is the architect ruling in [#134](https://github.com/arkgast/orasenda/issues/134), dated 2026-11-09. Spec A keeps its original letters as history; its legend is in [the focus session loop spec](specs/2026-11-08-focus-session-loop.md#context-p1-sub-projects).

**Note (2026-11-10), amending #134's table.** The owner asked for every component P1's screens need to be ready before the screens are built, so each screen sub-project builds behaviour and UI from finished components. An unlettered **Components** sub-project now sits between B and C ([spec](specs/2026-11-10-p1-components.md)); no letter changes. It also takes from C the Playwright WebKit layout harness, the bundled fonts and `verification/contrast.py`. C keeps the Today layout cases, #119's failing test included. Components for later phases (planning, tracking and blocking) stay with those phases. The rest of #134's ruling (the screen sub-projects, their order, the Spec A amendment rule) stands.

| # | Sub-project | Scope | Depends on | Tasks |
|---|---|---|---|---|
| **A** | Focus session loop | Done (#110, #117). Tail follow-ups #121, #122, #124, #125, #129 are independent of the redesign. | none | 8 (done) |
| **B** | **Settings** | Settings page on `PageFrame`, regular layout. General (theme), Timer (presets, Custom minutes), Notifications (off by default), About, Apps and sites as an interim EmptyState. Save on change, ⌘, opens it. Notification migration in Rust. | A, design-system PR merged | 4–5 |
| — | **Components** | Design-first, every design-system component P1's screens need, with a component test and a WebKit specimen in both themes: `IconButton`, `Tooltip`, `Kbd`, the key table (`describeShortcut`), fluid `TimerRing`, `TimerStrip`, `timerLayout`, `StartButton`, `PopoverMenu`, `FullScreenFocus`, `FloatingTimer`, `CommandPalette`, `CapturePad` copy, `ShortcutRecorder`, and last the `Icon` set with the final rail icons and `NavRail` roving focus. Also the Playwright WebKit layout harness, the bundled fonts and `verification/contrast.py` in `ci.sh`. No screen changes. | B | 7 (done) |
| **C** | **Today redesign** | Today layout cases on the Components harness (#119's failing test). Window minimum 360×240, compact, regular and spacious layouts, compact Pages menu, the Still Point grid using the fluid `TimerRing` or `TimerStrip`, the preset `PopoverMenu`, refused-start line with "Open Settings" (#120), in-app shortcuts and menu-bar items. The DevPanel leaves Today. Builds no design-system component (Components does). | B, Components | 5–6 |
| **D** | **Focus views** | Focus view button and menu. Full screen in a borderless window per display (⌘⇧F). Floating timer panel (⌘⇧T). Menu-bar *Full screen ▸* and *Floating timer* items, and the ⌘K command palette. The windows and wiring only: `FullScreenFocus`, `FloatingTimer` and `CommandPalette` come from Components. Proposes the windows-and-surfaces ADR (next free number). | C | 5 |
| **E** | **Session cadence** | Breaks and long breaks, keep-going prompt after "Just 2 minutes", +10 min capped at 2, two-minute warning, deep-hours cap, intent line, `sessions_today`. Settings › Timer gains long break, rounds and the extension cap; Settings › Notifications gains *Two minutes before the end*. The floater and full-screen states come last, after D. Break and warning states are the components' `mode` values, built in Components. | C (D for the last task) | 6–7 |
| **F** | **Hotkeys and capture** | Global shortcuts ⌃⌥F and ⌃⌥N, Settings › Keyboard, single-key shortcuts with an off switch, the capture panel (with `CapturePad`; Settings › Keyboard with `ShortcutRecorder`, both from Components), `capture_note`, plain Inbox, one-time welcome lines. | C, D | 5–6 |
| **G** | **Data portability** | Export and import of the versioned JSON bundle, automatic backups, Settings › About and data, "Delete all data". | B, E, F | 4 |

**Build order: A → B → Components → C → (D ∥ E) → F → G.**

**Note (2026-11-10).** The [structure refactor](specs/2026-11-10-structure-refactor.md) (500-line ceiling, a UI-free service crate, feature folders, no legacy code) is done (2026-11-11) and ran before sub-project C.

Tracking and blocking stay in P5 and P6. No P1 change there.

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

