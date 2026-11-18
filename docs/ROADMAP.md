# Orasenda: Roadmap

> Derived from [SPEC.md](SPEC.md). Each phase ships something usable and ends with a dogfooding week and a retro.

## Audience
First users: **people with ADHD and knowledge workers on Mac** who want a kind, private focus tool. The promise: *plan your day and protect it, without being judged or watched.*

## Releases
Phases are grouped into releases. Each release goes to real users before the next one starts.

| Release | Phases | Audience | Goal |
|---|---|---|---|
| **Private beta** | P0 + P1 + P2 | 10–20 testers from the target audience | Used daily; weekly feedback. **Built (2026-11-16):** 0.1.0 = P1, 0.2.0 = P2 |
| **Public v1** | P3 + P4 | Public (Show HN, Product Hunt, r/ADHD, r/productivity) | Launch with donations and the supporter licence (ADR-006) |
| **v2 "Protect"** | P5 + P6 + P7 | Public | Second launch: tracking and blocking, the main differentiator |
| **v3 "Everywhere"** | P10 | Public | Paid Orasenda Sync, iOS companion, Windows, web app |
| Later | P8, P9 | Public | Sound and music, when users ask for them |

**Versions.** Until public v1, each finished phase is a minor release: **0.1.0** is P1 Focus Core and **0.2.0** is P2 Tasks. 0.2.0 also carries P4's routines and habits, built alongside P2. Later phases follow the same rule. P0 had no release. Public v1 is **1.0.0**.

## Phases

| Phase | Name | Scope | Exit criteria |
|---|---|---|---|
| **P0** | Foundations | Tech decisions recorded in `DECISIONS.md` (stack, storage, distribution, blocking approach, licence, telemetry), with a **spike** proving foreground-app detection and an overlay on macOS. Design pass in Claude Design: tokens, Today, Timer, Board, Full-screen. Repo, CI and lint set up. **App shell:** Tauri 2 + React + Rust core, macOS gating CI, Windows advisory CI, mobile projects smoke-tested. | **Done.** Decisions approved, spike works, design tokens ready, shell passes `ci` on macOS |
| **P1** | Focus Core | Timer presets, menu-bar and mini timer, 2-minute start, flow extension, capture pad, 2-minute warning, full-screen, deep-hours cap, local store (sync-ready, ADR-002), export, import, automatic backups. Split into sub-projects A–G plus an unlettered Components sub-project, built A → B → Components → C → (D ∥ E) → F → G; see [P1 sub-projects](#p1-sub-projects) and [the focus session loop spec](specs/2026-11-08-focus-session-loop.md). | **Done (2026-11-14), version 0.1.0.** Usable daily as a focus timer |
| **P2** | Tasks | Kanban with WIP limits, Deep/Shallow, estimates with buffer, time per task, breakdown prompt, Frog, quick-add hotkey, **task import** (Apple Reminders on the device; Todoist and Things exports) | **Done (2026-11-16), version 0.2.0.** Every session can be linked to a task (optional, owner 2026-11-14), with estimated vs actual time. Board, Board polish, task import and pointer drag shipped |
| **P3** | Plan the Day | Built-in calendar, drag-to-block, overflow block, block-starts-session prompt, energy-aware suggestions, realistic finish time, reshuffle, onboarding, **read-only calendar import** (macOS EventKit and ICS files, on the device, no account) | Full day planned and executed in the app, around existing calendar events |
| **P4** | Routines and Reviews | Unified routines and habits, 5 templates with disclaimers, daily shutdown, weekly review and plan, neutral stats | **Done (2026-11-17).** Built and merged: routines and habits, the Review page with the shutdown, the weekly review and plan, and neutral stats, with the nudges off by default ([spec](specs/2026-11-16-reviews.md)). The exit criterion, one week of use with reviews completed, is the owner's dogfooding check |
| **P5** | Awareness | Opt-in usage tracking with every privacy control, categories, per-session switches, weekly distraction insights | Trustworthy local tracking |
| **P6** | Protection | Blocking profiles, Gentle and Firm, safety allowlist, browser fallback, guided Focus filter setup, contextual permissions | Blocking works without being trivially bypassed |
| **P7** | Web Extension and Strong Lock | Browser extension for domain tracking and blocking, strong lock with an anti-quit helper, interruption analytics | Websites covered |
| **P8** | Sound and Recovery | Noise generator and ambiences, binaural option, NSDR audio, brief-rest cue (experimental) | |
| **P9** | Music Integration | Local library and playlists, royalty-free sources, optional yt-dlp personal plugin | |
| **P10** | Sync and Multi-platform | Accounts, paid end-to-end encrypted sync (ADR-002, ADR-006), web app, iOS companion with Screen Time blocking, Android, Windows builds, two-way external calendars, body-doubling and status sharing, template gallery | Paying sync users on at least two platforms |

**Note (2026-11-14).** The owner changed the order after P1. P4's **routines and habits** run now, in parallel with P2 (Tasks, built by a separate session). P3 (Plan the Day) comes after them. P4's daily shutdown, weekly review and stats follow the routines part. See [the routines and habits spec](specs/2026-11-14-routines-and-habits.md) and [plan](plans/2026-11-14-routines-and-habits.md).

**P4 progress (2026-11-14, routines).** The routines and habits part is built (R1–R10, epic [#513](https://github.com/arkgast/orasenda/issues/513)): the Routines page with routines, standalone habits, check-ins and a 28-day dot grid; the five templates with their wellness note; the step-by-step run view (Enter, S, Esc); the editors with Undo; and the due nudge in Settings › Notifications, off by default. Four syncable tables arrive in migration 0007. Still to come in P4, each with its own spec: the daily shutdown flow ([#560](https://github.com/arkgast/orasenda/issues/560)), the weekly review and plan ([#561](https://github.com/arkgast/orasenda/issues/561)) and neutral stats ([#562](https://github.com/arkgast/orasenda/issues/562)). Smaller follow-ups: starting a routine from its nudge ([#563](https://github.com/arkgast/orasenda/issues/563)), the Frog step linked to the Board ([#564](https://github.com/arkgast/orasenda/issues/564), after P2), Deep Work Start's blocking step ([#565](https://github.com/arkgast/orasenda/issues/565), after P6), onboarding's Morning template ([#566](https://github.com/arkgast/orasenda/issues/566), P3), and [#547](https://github.com/arkgast/orasenda/issues/547), [#567](https://github.com/arkgast/orasenda/issues/567)–[#570](https://github.com/arkgast/orasenda/issues/570). See [the spec's follow-ups](specs/2026-11-14-routines-and-habits.md#follow-ups).

**Note (2026-11-14, Board).** P2 runs now, with P4 Routines alongside and P3 later (owner, 2026-11-14). P2 is built as one sub-project, the Board: tasks, columns with WIP limits, Inbox → Board, and a session that picks a task. Task import (Apple Reminders, Todoist, Things) is a P2 follow-up after the Board. See [the Board spec](specs/2026-11-14-board.md) and [plan](plans/2026-11-14-board.md). **P2 progress (2026-11-15).** The Board is done: tasks, four columns with limits, Inbox → Board and a session that picks a task. **P2 done (2026-11-16).** Board polish, task import ([#582](https://github.com/arkgast/orasenda/issues/582): Apple Reminders, Todoist and Things) and pointer drag ([#583](https://github.com/arkgast/orasenda/issues/583)) are built. The palette's choose or clear task ([#581](https://github.com/arkgast/orasenda/issues/581)) is done too. Column add and remove ([#584](https://github.com/arkgast/orasenda/issues/584)) is deferred to Later. Buffer auto-tune ([#585](https://github.com/arkgast/orasenda/issues/585)) moved to P4 neutral stats ([#562](https://github.com/arkgast/orasenda/issues/562)). Specs: [Board polish](specs/2026-11-15-board-polish.md), [task import](specs/2026-11-15-task-import.md).

**P4 done (2026-11-17).** P4 Reviews is built on top of the routines and habits: the Review page with the daily shutdown, the weekly review and plan (up to three priorities), and neutral stats (words first, Week, 8 weeks and 6 months), the buffer suggestion, the two nudges (off by default) and their Settings rows. Spec [2026-11-16-reviews](specs/2026-11-16-reviews.md), plan [2026-11-16-reviews](plans/2026-11-16-reviews.md); the PR list is in the spec. Follow-ups are #727 to #733. The routines follow-ups in the P4 progress note above keep their own issues. The exit criterion, one week of use, is still to be checked.

**Note:** P1–P4 make a complete, useful product with no system permissions at all, so they are a safe base before the risky macOS work in P5–P7.

## P1 sub-projects
P1 is built as eight sub-projects (seven lettered, plus Components), each with its own spec, plan and implementation cycle. The redesign (Settings, Today, Focus views) comes before session cadence. The re-cut is the architect ruling in [#134](https://github.com/arkgast/orasenda/issues/134), dated 2026-11-09. Spec A keeps its original letters as history; its legend is in [the focus session loop spec](specs/2026-11-08-focus-session-loop.md#context-p1-sub-projects).

**Note (2026-11-10), amending #134's table.** The owner asked for every component P1's screens need to be ready before the screens are built, so each screen sub-project builds behaviour and UI from finished components. An unlettered **Components** sub-project now sits between B and C ([spec](specs/2026-11-10-p1-components.md)); no letter changes. It also takes from C the bundled fonts and `verification/contrast.py`. Components for later phases (planning, tracking and blocking) stay with those phases. The rest of #134's ruling (the screen sub-projects, their order, the Spec A amendment rule) stands.

| # | Sub-project | Scope | Depends on | Tasks |
|---|---|---|---|---|
| **A** | Focus session loop | Done (#110, #117). Tail follow-ups #121, #122, #124, #125, #129 are independent of the redesign. | none | 8 (done) |
| **B** | **Settings** | Settings page on `PageFrame`, regular layout. General (theme), Timer (presets, Custom minutes), Notifications (off by default), About, Apps and sites as an interim EmptyState. Save on change, ⌘, opens it. Notification migration in Rust. | A, design-system PR merged | 4–5 (done) |
| — | **Components** | Design-first, every design-system component P1's screens need, with a component test and a specimen in both themes: `IconButton`, `Tooltip`, `Kbd`, the key table (`describeShortcut`), fluid `TimerRing`, `TimerStrip`, `timerLayout`, `StartButton`, `PopoverMenu`, `FullScreenFocus`, `FloatingTimer`, `CommandPalette`, `CapturePad` copy, `ShortcutRecorder`, and last the `Icon` set with the final rail icons and `NavRail` roving focus. Also the bundled fonts and `verification/contrast.py` in `ci.sh`. No screen changes. | B | 7 (done) |
| **C** | **Today redesign** | Window minimum 360×240, compact, regular and spacious layouts, compact Pages menu, the Still Point grid using the fluid `TimerRing` or `TimerStrip`, the preset `PopoverMenu`, refused-start line with "Open Settings" (#120), in-app shortcuts and menu-bar items. The DevPanel leaves Today. Builds no design-system component (Components does). | B, Components | 5–6 (done) |
| **D** | **Focus views** | Focus view button and menu. Full screen in a borderless window per display (⌘⇧F). Floating timer panel (⌘⇧T). Menu-bar *Full screen ▸* and *Floating timer* items, and the ⌘K command palette. The windows and wiring only: `FullScreenFocus`, `FloatingTimer` and `CommandPalette` come from Components. Proposes the windows-and-surfaces ADR (next free number). | C | 5 (done) |
| **E** | **Session cadence** | First the **preset library** (Gentle Start 15/5, Steady Focus 25/5, Deep Work 90/15; edit, remove, add up to 12, restore defaults; a syncable `preset` table that replaces the fixed presets and Custom). Then breaks that start by themselves and long breaks by rounds, the keep-going prompt after "Just 2 minutes", +10 min up to a cap (default 2), the two-minute warning on focus and breaks, the deep-hours cap, the optional intent line after Start (removed in H2, 2026-11-13), rotating break suggestions with honest labels, `sessions_today`. Settings › Timer gains the preset list, the extension cap and the deep-hours cap; Settings › Notifications gains *Two minutes before the end*. The floater and full-screen states come last, after D. Break and warning states are the components' `mode` values, built in Components. [Spec](specs/2026-11-12-session-cadence.md). | C (D for the last task) | 7 (done) |
| **F** | **Hotkeys and capture** | Global shortcuts ⌃⌥F and ⌃⌥N, Settings › Keyboard, single-key shortcuts with an off switch, the capture panel (with `CapturePad`; Settings › Keyboard with `ShortcutRecorder`, both from Components), `capture_note`, plain Inbox, one-time welcome lines. [Spec](specs/2026-11-12-hotkeys-and-capture.md). Done (2026-11-13). | C, D | 10 (done) |
| **G** | **Data portability** | Export and import (whole SQLite data files, ADR-018), automatic backups with a pending-swap Restore, "Delete all data". The Rust and IPC (G1–G7) are done; the Settings UI moved to H as the About, Your data and Backups panes (H6 #463, H7 #464), which supersede G8 #419 and G9 #420. [Spec](specs/2026-11-12-data-portability.md). Done (2026-11-14). | B, E, F | 7 (done) |
| **H** | **Structure, keys, focus and Settings** | React layers (surfaces > app > features > domain > shared, ADR-021); the session intent removed; two bindings per action, *In Orasenda* menu keys and *Everywhere* global keys from one registry (ADR-020); full screen as `main` in native full screen (ADR-019); master-detail Settings with seven panes, `SettingsNav`, `DataTable`; the About, Your data and Backups panes. [Spec](specs/2026-11-13-polish-structure-keys-focus-settings.md). Done (2026-11-14). | G (G1–G7) | 22 (done) |

**Build order: A → B → Components → C → (D ∥ E) → F → G.**

**Note (2026-11-12).** The owner widened E: the preset library is E's first task (it replaces the fixed presets and Custom), and break suggestions join its scope. E is planned as seven tasks; the last one waits for D. See the [Session cadence spec](specs/2026-11-12-session-cadence.md).

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

