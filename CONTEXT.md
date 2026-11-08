# Domain context

Shared vocabulary for people and agents working on this project. Use these terms exactly, in
code, specs and issues. When a term is ambiguous or keeps needing explanation, add it here.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Session | One timed run of focus (later also of a break): a start time, a planned length, pauses and an end. Stored as a `focus_session` row once it has ended. | A time block on the calendar (a plan, not a run) |
| Preset | A named set of lengths: Classic 25/5, 50/10, Deep Block 90, Custom. Choosing one does not start anything. | The session itself |
| Quick start | The "Just 2 minutes" button: a session with the `quick` preset, a fixed 2 minutes, never the selected default. | A Custom preset (user-chosen lengths, 5 minutes or more) |
| Phase | What a session is for: `focus` now, `break` from sub-project B. | The session's state (idle, running, paused) |
| Planned end | Start time plus planned length plus the total paused time. A session ends at its planned end even if the app notices late. | The moment the app noticed the end |
| Milestone | A one-shot transition the engine reports: started, paused, resumed, ended, recovered. There is at most one per transition and none per tick. | A tick (the once-a-second refresh of the view) |
| Engine | A pure core type that takes the current time and returns a view and milestones; it never reads the clock. | The scheduler, which feeds it time |
| Scheduler | The app-crate thread that wakes once a second, advances the engines and publishes the result. | A JavaScript timer |
| Surface | Anything that shows the state: Today, the menu-bar item, the mini timer, full screen, a notification. Surfaces subscribe; they own no state. | A window (one kind of surface) |
| Syncable | An entity that will travel between devices: every field write appends to `change_log`. | Device-only |
| Device-only | An entity that stays on this device and never writes `change_log`: the active session, window positions, bypass reasons, raw usage. | Private or secret data (a separate question) |
| Change log | The `change_log` table: one row per changed field of a syncable entity, stamped with a hybrid logical clock and the device id (ADR-002). | An audit log for the user |
| Degraded | The app running with its store unavailable or newer than the build: the timer works in memory, nothing is saved, Today keeps a standing line and announces it once. | A crash |
| Pending milestone | A milestone that happened before any window was listening (at launch); `timer_state` returns and drains it. | An event (delivered live) |
| Ended early | A session the user ended with *End session*; recorded with `end_reason: stopped` and its real focused minutes. | A failed or abandoned session (words the app never uses) |

## Relationships
- A preset has a spec (lengths); a session is started from a spec and remembers its preset.
- A session has one phase and moves idle → running ⇄ paused → ended; ending produces a record and a milestone.
- The scheduler feeds every engine the same `now_ms`; surfaces render the resulting view.
- Syncable entities write change-log rows in the same transaction; device-only entities do not.

## Decisions
ADRs live in [docs/DECISIONS.md](docs/DECISIONS.md): ADR-002 (storage), ADR-011 (time and scheduling), ADR-012 (store crate API), ADR-013 (one Rust state, many surfaces).
