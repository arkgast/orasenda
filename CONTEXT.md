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
| Focus view | Either way of showing the timer outside Today: full screen (the main window in native full screen) or the floater, from Today's two buttons, the View and Window menus, the menu-bar menu or ⌘K. | Today (the main window's page) |
| Full screen | The main window in native macOS full screen with the nav rail and page header hidden, rendering `FullScreenFocus` (ADR-019). Replaced the borderless `focus-<display>` Focus window in H4 (2026-11-14). | The floater |
| Floater | The floating timer: a non-activating, always-on-top panel (label `floater`) on every Space with `FloatingTimer`; opening it hides the main window. | The menu-bar item (a native status item, not a window) |
| Display | A connected screen, keyed by its CoreGraphics UUID, named by `NSScreen.localizedName`, with a frame and a visible frame (the frame minus the menu bar and Dock). Read from macOS, never stored on its own. | A Space (a desktop; one display can have several) |
| Window frame | A window's remembered position and size on one display, in display-relative points, in the device-only `window_frame` table. Only the floater has one. | A display's frame (the screen's own rectangle) |
| Key focus without activation | The floater receiving keys after a click or an explicit open while another app stays active and keeps the menu bar. | Activating Orasenda (what the main window does) |
| Command palette | The ⌘K list of every action available now, in the main window only (`CommandPalette`). | A menu (native, fixed items) |
| Preset library | The `preset` table (syncable, from sub-project E): named presets with focus, break, long break and rounds, at least one and up to 12 added by hand. Replaces the fixed list in *Preset* above; `quick` stays a built-in, never listed. | The selected preset (the `timer.preset` setting, a preset id) |
| Default preset | One of Gentle Start 15/5, Steady Focus 25/5 and Deep Work 90/15, seeded with a fixed id; *Restore default presets* brings back a missing or changed one. | A user preset (added by the person) |
| Preset snapshot | The preset's id, name and lengths copied into a session at start, so edits never change a running or recorded session. | The preset row itself |
| Break | A session of phase `break` that starts by itself when a focus session completes; it ends in idle. Recorded as its own `focus_session` row. | A pause (inside a session) |
| Long break | A break of the preset's long length, taken when the round is a multiple of the preset's rounds. | A break skipped or extended |
| Round | A completed focus session (an extended one counts once); `quick` and ended-early sessions are not rounds. | A session |
| Chain | Today's run of rounds toward the long break; it resets after a long break, at local midnight and after a gap longer than the long break. | A day's total |
| Extension | "+10 min": ten more minutes of the same focus session, from the two-minute warning or from its break; counted in `extensions`. | A new session |
| Extension cap | The global setting for how many extensions one session may take: Off, 1, 2 or 3 (default 2). | The deep-hours cap |
| Two-minute warning | The one-time switch of every surface to `mode: warning` at 2:00 left in a focus session or break longer than 2 minutes. | The end notification |
| Keep-going offer | "Keep going?" after a completed "Just 2 minutes": *Keep going* starts the selected preset at once, *Stop here* stays idle. Held in Rust. | A break (a quick session never starts one) |
| Open focus | A completed focus session whose break is running; it can still be extended, and its row is written when the break ends. | An unsaved record (a failed write) |
| Intent | Removed in H2 (2026-11-13). `focus_session.intent` stays in the schema, always NULL; migration 0006 cleared it. A later session picks a Board task instead. | A task (P2) |
| Deep-hours cap | The daily focus total (every focused minute, local day) past which Orasenda says one calm line; default 4 hours, never blocks Start. | A limit or a lock |
| Break suggestion | One rotating line shown during a break, labelled *optional* or *experimental* when the evidence is thin; not medical advice. | A routine (P4) |
| Auto-continue | The opt-in setting *Keep going automatically* (off by default): a running focus that reaches its end keeps going in 10-minute steps, each an extension, until *Longest focus* (default 90 minutes); then the break starts. Each step offers *Take a break*. | The extension cap (manual "+10 min") |
| Keep-going hint | A one-time quiet status line on Today after the first manual extension while auto-continue is off: it points to *Keep going automatically* in Settings › Timer. Shown once per device (`meta` key `hint.keep_going`). | The keep-going offer (*Keep going* / *Stop here* after a `quick` session) |
| Global shortcut | Old name (spec F) for an *Everywhere binding*. | A menu accelerator |
| Registration status | Whether a global shortcut is `registered`, `off` or `failed` on this device right now. In memory only. | The saved setting |
| Single-key shortcut | A one-key binding inside one surface (Space and P on Today; Space in Focus view), honouring the *Single-key shortcuts* setting (WCAG 2.1.4). Not rebindable. | A binding, which needs a modifier |
| Capture panel | The small non-activating panel (⌃⌥N) that saves a thought to the Inbox without leaving the current app. | The floater |
| Inbox note | One captured thought: text, Internal or External, a time. Syncable (`inbox_note`), removed by tombstone. Listed on Board. | A task card (Kanban, later) |
| Tip | A one-time neutral status line on idle Today ("Tip: …" with Got it), seen on Got it, on use, or after its second showing. | The keep-going hint (running, once) |
| Shortcut registry | The one table of actions (id, label, description, where it works, both defaults) that feeds the app menu, the global registrar, single-key handlers, palette hints and Settings › Shortcuts (ADR-020). | A hard-coded key in a component |
| In Orasenda binding | An action's key as a native app-menu accelerator: works in any Orasenda window while Orasenda is frontmost. Needs ⌘ or ⌃. May be empty. | An Everywhere binding |
| Everywhere binding | An action's key as a system-wide global shortcut (ADR-017), working from any app. Needs a modifier. May be empty. Has a registration status. | An In Orasenda binding |
| Fixed key | A key that can't be rebound: Esc in full screen and the standard app-menu items (⌘Q, ⌘W, ⌘, and ⌘K). | A binding |
| Never-delivered key | A chord macOS keeps for itself (⌘Tab, and similar), refused by the recorder. | A well-known key |
| Well-known key | A chord other apps commonly use (⌘F, ⌘C and similar). The recorder warns once before it becomes an Everywhere binding. | A never-delivered key |
| Fold rule | The one-time move of the spec-F keys `keys.start_pause` and `keys.capture` into the two-slot model, at launch and after importing an old file: the old default becomes the new default, a custom key becomes the Everywhere binding, and `"off"` becomes empty. | The repair pass |
| Repair pass | The deterministic fix for two slots holding the same chord, after load, after the fold and after each import: a fixed key wins, then a user-set slot over a default, then registry order. The loser is turned off and marked *repaired*. | The recorder's conflict check |
| Pane | One Settings view in the master-detail layout (General, Timer, Notifications, Shortcuts, About, Your data, Backups), picked from the sticky pane list. | A section of one long scroll |

## Relationships
- A preset has a spec (lengths); a session is started from a spec and remembers its preset.
- A session has one phase and moves idle → running ⇄ paused; ending (from running by time, or from either by *End session*) produces a record and a milestone and returns the engine to idle. Ended is not a state.
- The scheduler feeds every engine the same `now_ms`; surfaces render the resulting view.
- Syncable entities write change-log rows in the same transaction; device-only entities do not.

## Decisions
ADRs live in [docs/DECISIONS.md](docs/DECISIONS.md): ADR-002 (storage), ADR-011 (time and scheduling), ADR-012 (store crate API), ADR-013 (one Rust state, many surfaces), ADR-014 (settings), ADR-015 (code-first design system), ADR-019 (full screen in the main window), ADR-020 (two bindings, one registry), ADR-021 (frontend layers).
| Data file | A SQLite database Orasenda can open: `user_version` 1 to the current schema and a `meta.device_id`. Export and every backup are data files (whole copies made with `VACUUM INTO`). | A JSON export (Orasenda has none) |
| Backup | A data file in `<app data dir>/Backups/`, named `orasenda-<UTC time>-<kind>.db`; kinds `auto`, `manual`, `before-import`, `before-restore`. The newest N are kept, every kind counted. | An export (a data file the user saves anywhere) |
| Safety backup | A backup taken by Orasenda just before an import or a restore (`before-import`, `before-restore`). Delete all data takes none. | An automatic backup (on the monthly or 3-monthly schedule) |
| Merge import | Import's rule: syncable rows only in the file are added; on both sides the later `updated_at` wins and a tombstone counts as a change; device-only tables are ignored. | Restore (replaces the whole database) |
| Pending swap | `orasenda.restore.db` or the `orasenda.delete` marker in the app data dir, applied at the next launch before the store opens. | A migration |
