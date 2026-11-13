# Orasenda: Product Specification

> Version 0.2 · 2026-11-05 · Status: approved draft
> See also: [ROADMAP.md](ROADMAP.md) · [DECISIONS.md](DECISIONS.md)

## Vision
Orasenda is one calm, minimal app for planning time, managing tasks and protecting focus. It replaces a patchwork of tools: a pomodoro timer, a time-blocking calendar, a kanban board, a screen-time tracker, an app blocker, a habit tracker and focus sound. Its practices draw on *Deep Work*, *Atomic Habits*, *Indistractable*, *Four Thousand Weeks* and Huberman-inspired protocols, applied with respect for the user's autonomy and privacy.

**Decisions made so far:**
- **Audience:** people with ADHD and knowledge workers on Mac who want a kind, private focus tool. Personal use first, then a private beta, then a public v1 after P4 (see ROADMAP releases).
- **Platforms:** macOS 15.8.2+ first (gating CI, ADR-015); Windows 11 next (advisory CI); iOS and Android projects scaffolded and smoke-tested by hand, with no mobile features until P10. See ADR-001.
- **Data:** stored locally first, with optional paid end-to-end encrypted sync later (ADR-002, ADR-006).
- **Licence:** open source under MPL-2.0; the name is a trademark (ADR-009).
- **Telemetry:** none (ADR-008).
- **Calendar:** built-in, paired with a kanban board that tracks time on each task.

## 1. Product principles
1. **Calm by default.** One primary action per screen, no badges, no red alerts, no feeds.
2. **The user is in control.** Every block, rule and tracked category is chosen by the user. This follows self-determination theory: autonomy sustains motivation.
3. **Friction over prohibition.** Distractions get harder to reach but never become impossible without consent. Strong locks are opt-in and are described honestly as friction, not as unbreakable.
4. **Kind accountability.** No shaming. Streaks forgive a single miss ("never miss twice"). Metrics show neutral trends, never failures.
5. **Private by design.** Tracking is opt-in and stays on the device. The app records the app or domain and its duration only: no keystrokes, screenshots or page content.
6. **Evidence-informed, honestly labeled.** Every technique is an editable template. Weakly supported practices are marked *optional* or *experimental*. All wellness suggestions are **not medical advice**.
7. **Accessible and ADHD-friendly.**
   - Time is always visible.
   - Starting takes as little effort as possible.
   - State is never shown by color alone.
   - Full keyboard and VoiceOver support.

## 2. Modules

### 2.1 Focus Timer (Pomodoro-style)
- **Presets:**
  - Classic Pomodoro-style: 25 min focus, 5 min break, 15–30 min long break after 4 rounds.
  - 50/10, a common variant.
  - Deep Block: 90+ min, following Newport's preference for long blocks. The 90-minute cycle is presented as a convention, not as physiology.
  - Custom.
- **Menu-bar timer and floating mini timer:** time is always visible, which helps with time blindness.
- **"Just start for 2 minutes" button:** lowers the cost of starting (the 2-minute rule).
- **Flow extension:** at the end of a session, offer "+10 min" instead of a forced break. Capped at 2 by default.
- **Session intent:** one line answering "What will be done?", linked to a kanban task. *Removed in H2 (2026-11-13, [spec](specs/2026-11-13-polish-structure-keys-focus-settings.md)); a session will pick a Board task instead, in the board sub-project.*
- **Capture pad:** a hotkey jots down a thought without leaving focus. This offloads open loops (Masicampo & Baumeister, 2011). Each note is tagged as an **internal or external interruption**, following the Pomodoro interruption protocol, and lands in the Inbox.
- **2-minute warning** before a session or block ends, using a gentle cue.
- **Break suggestions:** stand, rest your eyes on a distant point, hydrate, take a physiological sigh, walk. Breaks steer away from the phone.
- **Post-study NSDR or Yoga Nidra audio** (optional; evidence is limited and it "may aid recovery").
- **Brief-rest cue (experimental):** short scheduled rests during practice. Framed as "brief rests may help consolidate practice"; the study behind it (Buch et al., 2021) tested motor skills, not studying.
- **Full-screen mode:**
  - remaining time in very large tabular numerals;
  - the current task;
  - a small wall clock;
  - a progress ring.
  Esc exits after a confirmation.
- **Deep-hours cap:** a gentle notice past about 4 deep hours a day (Newport's guidance on sustainable depth) to discourage overwork.

### 2.2 Tasks: Kanban Board
- **Columns (editable):** Inbox → Backlog → Today → Doing → Done.
- **WIP limits** (from Personal Kanban, Benson & Barry): Doing allows 1, and Today warns past 3. The philosophy behind the limits is Burkeman's open and closed lists (*Four Thousand Weeks*).
- **Task fields:**
  - title, notes, project or tags
  - **Deep or Shallow** (Newport)
  - estimate in pomodoros and tracked time
  - due date, priority, checklist
- **Planning-fallacy buffer:** estimates are padded by 25–50% by default, and the padding auto-tunes from the user's own estimated-vs-actual history.
- **Breakdown prompt:** when an estimate goes over 4 pomodoros, suggest splitting the task.
- **Frog flag** (*Eat That Frog*): one hardest, most important task per day.
- **Global quick-add hotkey** sends to the Inbox (GTD capture).

### 2.3 Built-in Calendar and Time Blocking
- Day view (default) and week view.
- **Drag a task onto the calendar** to create a block, sized by its buffered estimate.
- **Block types:** Deep, Shallow, Break, Routine, Personal, and an **Overflow block** (Newport's "conditional" block).
- When a block starts, a gentle prompt offers to start a session with that block's task and blocking profile.
- **Energy-aware suggestions:**
  - Onboarding asks for wake time and whether the user is a morning or evening person.
  - Deep blocks are suggested in the first 1–4 hours after waking, and Shallow work in the afternoon dip (Pink, *When*).
- **Realistic finish time** for the day is shown on the Today screen.
- **Reshuffle:** moves the rest of the day without guilt.

### 2.4 Routines and Habits (one module)
Habits are recurring items, and routines are ordered groups of them that run at a time of day.

**Habit fields:**
- an implementation intention: "I will [X] at [time] in [place]" (Gollwitzer);
- an anchor or stack: "After [current habit], I will [X]" (BJ Fogg's anchoring, popularized by Clear);
- a 2-minute version;
- an identity statement (*Atomic Habits*).

**Tracker:** a calm dot grid. A single miss does not break the streak; two in a row prompt a kind restart.

**Starter templates** (editable; each one carries the "wellness suggestions, not medical advice" note):
- **"Morning Light & Movement"** (inspired by Huberman Lab):
  - water;
  - outdoor light for 5–10 min, 15–20 min if overcast, or 30+ min if heavily overcast (a heuristic grounded in circadian science);
  - move for 5–10 min;
  - set the Frog and 3 priorities.
  - *Optional:* delay caffeine 90–120 min (the evidence is contested), electrolytes, and a 30–60 s visual-focus drill (weak evidence).
- **"Deep Work Start":**
  - clear the desk;
  - put the phone in another room;
  - close chat;
  - write the intent;
  - start the blocking profile.
- **"Study Session":**
  - active recall and self-testing rather than re-reading;
  - optional brief-rest cue;
  - optional NSDR afterward.
- **"Evening Shutdown":** see 2.5.
- **"Wind-down":**
  - dim lights and avoid bright overhead light late at night;
  - set a no-screens cutoff.

### 2.5 Shutdown, Reviews and Planning
- **Daily shutdown (2–5 min):**
  - move unfinished tasks;
  - preview tomorrow;
  - stoic reflection: what went well, what to improve, what was outside my control;
  - "shutdown complete" (Newport).
- **Weekly review and plan (15–20 min):**
  - deep hours compared with the user's goal (a lead measure, *4DX*);
  - time per project;
  - top distractions and the reasons given for bypassing blocks;
  - routine consistency;
  - one improvement for next week;
  - **plan next week's deep blocks** (Newport's weekly planning).
- Usage data appears mainly in reviews. There is no live dashboard nagging the user.

### 2.6 App and Website Usage Tracking (opt-in)
- Records the foreground app and its duration. The domain comes from the browser extension, never full URLs.
- **Categories:** Focus / Neutral / Distracting, set by the user.
- **Privacy controls:**
  - a "never record" list per app or domain (app names can reveal health, finance or other sensitive information);
  - a global pause;
  - private and incognito windows are excluded automatically;
  - **90-day retention** by default;
  - delete everything in one click;
  - export to CSV or JSON.
- Idle detection pauses tracking.
- Per-session view, for example "14 app switches this session".

### 2.7 Distraction Blocking
- **Blocklists and profiles** (Deep Work, Study, Light, custom), all chosen by the user.
- **Triggers:** focus session (default), calendar block type, schedule, or manual.
- **Strictness levels:**
  1. **Gentle (default):** a calm overlay asks "Is this what you intended?" and plays a breath animation. It offers *Return to focus*, or *Surf the urge*, a 10-minute wait (Eyal's technique), before allowing access.
  2. **Firm:** a 60 s wait plus a typed reason (Eyal's effort pact). Reasons can be deleted and are never synced.
  3. **Strong lock (Ulysses pact):** no in-app bypass until the session ends. The UI says plainly that it is *strong friction, not unbreakable*.
- **Safety allowlist (never blocked):** Phone, Messages, FaceTime, System Settings, accessibility tools and user-chosen emergency contacts.
- **What macOS allows** (to be confirmed in the tech phase):
  - The app detects the foreground app, which needs no permission, then overlays, hides or optionally closes it.
  - Websites are blocked through the browser extension.
  - Until the extension exists, a **browser fallback** applies: during Deep profiles, selected browsers count as Distracting.
  - System Focus mode can't be switched on by an app, so the product **guides the user to set up a Focus filter** instead.
  - Permissions are requested **at the moment they're needed**, not all at onboarding.
- Breaks unblock automatically unless the user opts to keep the blocks on.

### 2.8 Focus Sound
- **Generated sound** (no rights issues): white, pink and brown noise; rain; café.
- **Optional binaural or 40 Hz mode,** labeled "ambient sound some people find helpful", not as a focus mechanism. Binaural mode requires headphones.
- **Deferred to a future Music Integration phase:**
  - a local music library and playlists;
  - curated royalty-free and Creative Commons lofi;
  - optional yt-dlp import (personal-use plugin, user-installed binary, rights consent, never bundled or shipped in store builds).

### 2.9 Statistics (neutral)
- **Daily:** deep hours, sessions, whether the Frog was done, and time per task.
- **Weekly:** a trend of deep hours, the split between focus and distracting time, and estimate accuracy.
- Everything is shown as neutral trends, with no leaderboards.

## 3. UX and Visual Direction
To be refined later in Claude Design.
- **Navigation:** a slim left rail (Today · Board · Calendar · Routines · Review · Settings), a menu-bar item, and a ⌘K command palette.
- **Today screen:** the current or next block, a large Start button, the Frog, 3 priorities and the realistic finish time.
- **Palette:**
  - desaturated blues and teals for focus;
  - sage green for breaks and progress;
  - warm sand for routines;
  - **amber rather than red** for "time almost up";
  - warm off-white or deep slate backgrounds.
  Effects of color are modest and depend on context, so the choice is aesthetic, not causal. **Color is never the only signal**: icons and labels always accompany it.
- **Typography:** a humanist sans, tabular numerals for the timer, and an optional **dyslexia-friendly font**.
- **Theme:** follows the system light or dark setting. A sunrise/sunset option asks for a city.
- **Motion:** slow ease-in-out, respecting "reduce motion". Sound is soft chimes with no alarms.
- **Accessibility:** full keyboard navigation and VoiceOver labels.
- **Onboarding (short):**
  1. Wake time and morning/evening preference
  2. Default timer preset
  3. Morning template
  Tracking and blocking are offered later, in context, together with their privacy explainer.

## 4. Data Model (conceptual)
- `Task`, `Project`, `Tag`
- `TimeBlock` (type includes overflow)
- `FocusSession` (preset, extensions, interruptions[internal|external], appSwitches; the intent was removed in H2, 2026-11-13)
- `Habit` (intention, anchor, twoMinute, identity) → `HabitCheck`
- `Routine` (ordered habits, time of day) → `RoutineRun`
- `BlockProfile` (strictness, apps, domains, triggers)
- `SafetyAllowlist`
- `BypassEvent` (local-only)
- `UsageRecord`
- `NeverRecordRule`
- `Review` (daily or weekly, plus the weekly plan)
- `UserProfile` (wake time, chronotype, deep-hours goal and cap, estimate buffer)
- `Template` (shareable JSON bundle)
- `Backup`

No user accounts until the sync phase.

## 5. Legal and Compliance
- Template names avoid real people's names, for example "inspired by Huberman Lab".
- Public copy says "Pomodoro-style" (the Pomodoro Technique is a registered mark of Francesco Cirillo).
- A persistent wellness disclaimer on routines, NSDR and sound.
- yt-dlp is excluded until the Music Integration phase and is never in store builds.
- **Distribution:** a notarized direct download first; app stores later (ADR-003). The App Store sandbox likely rules out tracking and blocking.

## 6. Success Metrics (neutral, well-being aware)
- **North star:** deep hours per week compared with the user's goal.
- **Supporting:**
  - share of planned blocks started;
  - estimate accuracy;
  - shutdown completed;
  - days within the deep-hours cap;
  - bypass trend, shown only as a neutral trend.

## 7. Open Questions for the Tech Phase
- How app blocking can work on macOS without MDM, and how to resist the app being quit (a helper agent?).
- ~~The stack that best shares code across desktop, web and mobile.~~ Answered by ADR-001.
- Local storage and the future sync design (a CRDT or event log behind end-to-end encryption).
- Notarized direct download vs the Mac App Store.
- Business model.

## 8. Out of Scope for Now
- Two-way external calendar sync (read-only import on the device comes in P3)
- Mobile and web features (the mobile projects are scaffolded and smoke-tested from P0)
- The music library
- yt-dlp
- Public template gallery
- Accounts

All of these appear in the roadmap.

