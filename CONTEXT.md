# Domain context

Shared vocabulary for people and agents working on this project. Use these terms exactly, in
code, specs and issues. When a term is ambiguous or keeps needing explanation, add it here.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Session | One timed run of focus (later also of a break): a start time, a planned length, pauses and an end. Stored as a `focus_session` row once it has ended. | A time block on the calendar (a plan, not a run) |
| Preset | A named set of lengths: Classic 25/5, 50/10, Deep Block 90, Custom. Choosing one does not start anything. | The session itself |
| Quick start | The "Just 2 minutes" button: a session with the `quick` preset, a fixed 2 minutes, never the selected default. | A Custom preset (user-chosen lengths, 5 minutes or more) |
| Phase | What a session is for: `focus` now, `break` from sub-project B. | The session's state (idle, running, paused) |
| Planned end | Start time plus planned length plus the total paused time, known only while the session is running (a paused session has none until it resumes). A running session ends at its planned end even if the app notices late. | The moment the app noticed the end |
| Milestone | A one-shot transition the engine reports: started, paused, resumed, ended. There is at most one per transition and none per tick. | A tick (the once-a-second refresh of the view) |
| Milestone event | The IPC form of a milestone (`MilestoneEvent`), plus `recovered`, which only the app crate can know. | A core milestone |
| Engine | A pure core type that takes the current time and returns a numeric view (`EngineView`) and milestones; it never reads the clock or formats text. | The scheduler, which feeds it time; the IPC `TimerView`, which the app crate builds from it |
| Scheduler | The app-crate thread that wakes once a second, advances the engines and publishes the result. | A JavaScript timer |
| Surface | Anything that shows the state: Today, the menu-bar item, the mini timer, full screen, a notification. Surfaces subscribe; they own no state. | A window (one kind of surface) |
| Syncable | An entity that will travel between devices: every field write appends to `change_log`. | Device-only |
| Device-only | An entity that stays on this device and never writes `change_log`: the active session, window positions, bypass reasons, raw usage. | Private or secret data (a separate question) |
| Change log | The `change_log` table: one row per changed field of a syncable entity, stamped with a hybrid logical clock and the device id (ADR-002). | An audit log for the user |
| Degraded | The app running with its store unavailable or newer than the build: the timer works in memory, finished sessions wait in memory as unsaved records, Today keeps a standing line. | A crash |
| Pending milestone | A milestone event that happened before any window was listening (at launch); `timer_state` returns and drains it. | An event (delivered live) |
| Ended early | A session the user ended with *End session*; recorded with `end_reason: stopped` and its real focused minutes. | A failed or abandoned session (words the app never uses) |
| Notification status | What macOS allows Orasenda: `notDetermined`, `granted`, `denied` or `unavailable` (no app bundle). Read from the OS at launch, when the main window gains focus, after a request and before posting; never stored. | The notification preference |
| Notification preference | The user's *Tell me when a session ends* setting (`notify.session_end`), off by default. A notification is posted only when the preference is on **and** the status is `granted`. | The notification status |
| Notify review | The one-time check on a database created before the Settings spec: the preference stays on only if macOS already reports `granted`. Marked by the device-only `meta.notify_review` row. | A schema migration (the marker is written by one; the review itself needs the OS status) |
| Save line | The Settings page's reserved status row (`InlineNotice variant="row"`): at rest "Changes save as you make them.", otherwise the answer to the last save or the standing store line. | A toast (Orasenda has none for saves) |
| Theme override | `ui.theme` set to Light or Dark: Rust sets the app appearance and the webview sets `data-theme` on `<html>`. *Match system* removes both. | The system appearance |
| Specimen | A `<kebab>.specimen.tsx` page in `packages/ui/src/components/ui/` that renders every state of one component in fixed frames, in both themes. It is both the artifact's `components/<Name>/preview.html` and the page the WebKit layout specs, `just specimens`, the VoiceOver pass and PR screenshots load. Only the components a WebKit spec measures have one (code-first spec). | A static card (the generated preview of a component with no specimen) |
| First-consumer check | Checking a design-system change against the screen that will use it: its spec's accessibility acceptance, or, before that spec exists, its approved canvas and README slot tables, plus a component test and a specimen. | The component's own README review |
| Code-first | The design-system mode from ADR-015: TSX in `packages/ui` and `packages/tokens/tokens.json` are the source; the artifact is built by `just design-system` and published from `main` after each merge. | Design-first (the earlier mode: the artifact was edited by hand and copied into `design/system/`) |
| Legacy bundle | `packages/ui/src/legacy.js`, `legacy.css` and `legacy.d.ts`: today's hand-written `bundle.js`, `bundle.css` and `index.d.ts` as modules, kept only while components migrate, so `bundle.js` stays complete. Shrinks with each component PR; deleted at the end. | `design/system/components/bundle.js` (the generated artifact output) |
| Wave | A set of components whose component dependencies have all migrated; any of them may start, at most three at once, one PR each. | A P1 sub-project or a plan task group |
| Static card | The generated `preview.html` for a component with no specimen: name, the README's first paragraph and the props table, in both themes. | A specimen |
| Closed theme | `packages/tokens/theme.css`: a Tailwind `@theme` that first clears every default (`--*: initial`) and then lists only Orasenda tokens, so a class can only name a token. Generated from `tokens.json`; also maps shadcn's semantic variables (`primary` → `focus`, `destructive` → `critical`, …). | `tokens.css` (the plain CSS variables, also generated) |
| Type-only export | A type `@orasenda/ui` exports with no runtime: the `*NextProps` contracts and the contract-only components (`Select`, `SessionSlot`, `AppRow`, `RoleTag`, `AppPicker`, `BarRow`), in `src/types.ts`. | A runtime component (in `window.Orasenda`) |
| Focus view | Either way of showing the timer outside Today: the Focus window or the floater, chosen each time from the Focus view button, the Focus menu, the menu-bar menu or ⌘K. | Today (the main window's page) |
| Focus window | The borderless window, label `focus-<display>`, that covers one display's frame at normal window level with `FullScreenFocus`; at most one per display; it stays open, idle, after a session ends. | macOS native full screen (a Space of its own, never used) |
| Floater | The floating timer: a non-activating, always-on-top panel (label `floater`) on every Space with `FloatingTimer`; opening it hides the main window. | The menu-bar item (a native status item, not a window) |
| Display | A connected screen, keyed by its CoreGraphics UUID, named by `NSScreen.localizedName`, with a frame and a visible frame (the frame minus the menu bar and Dock). Read from macOS, never stored on its own. | A Space (a desktop; one display can have several) |
| Window frame | A window's remembered position and size on one display, in display-relative points, in the device-only `window_frame` table. Only the floater has one. | A display's frame (the screen's own rectangle) |
| Key focus without activation | The floater receiving keys after a click or an explicit open while another app stays active and keeps the menu bar. | Activating Orasenda (what the main and Focus windows do) |
| Command palette | The ⌘K list of every action available now, in the main window only (`CommandPalette`). | A menu (native, fixed items) |

## Relationships
- A preset has a spec (lengths); a session is started from a spec and remembers its preset.
- A session has one phase and moves idle → running ⇄ paused; ending (from running by time, or from either by *End session*) produces a record and a milestone and returns the engine to idle. Ended is not a state.
- The scheduler feeds every engine the same `now_ms`; surfaces render the resulting view.
- Syncable entities write change-log rows in the same transaction; device-only entities do not.

## Decisions
ADRs live in [docs/DECISIONS.md](docs/DECISIONS.md): ADR-002 (storage), ADR-011 (time and scheduling), ADR-012 (store crate API), ADR-013 (one Rust state, many surfaces), ADR-014 (settings), ADR-015 (code-first design system).
