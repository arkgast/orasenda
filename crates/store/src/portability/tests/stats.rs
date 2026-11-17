use super::{DEVICE, exec};
use crate::Store;
use crate::portability::{Counts, counts};

#[test]
fn counts_skip_tombstones() {
    let store = Store::open_in_memory(DEVICE).expect("opens");
    let fresh = store.read(counts).expect("counts");
    assert_eq!(fresh.sessions, 0);
    assert_eq!(fresh.notes, 0);
    let base = fresh.presets;
    exec(
        &store,
        "INSERT INTO setting (key, value, updated_at) VALUES ('a', '1', 0), ('b', '2', 0);
         INSERT INTO inbox_note (id, text, kind, created_at, deleted_at)
           VALUES ('n1', 'x', 'internal', 1, NULL), ('n2', 'y', 'external', 2, 9);
         INSERT INTO preset (id, created_at, updated_at, deleted_at, name, focus_min, break_min,
             long_break_min, rounds, position)
           VALUES ('p1', 0, 0, NULL, 'A', 25, 5, 15, 4, 90), ('p2', 0, 0, 3, 'B', 25, 5, 15, 4, 91);
         INSERT INTO focus_session (id, created_at, updated_at, deleted_at, preset, phase,
             planned_ms, started_at, ended_at, paused_total_ms, focused_ms, end_reason, extensions)
           VALUES ('s1', 0, 0, NULL, 'c', 'focus', 1, 1, 2, 0, 1, 'completed', 0),
                  ('s2', 0, 0, 4, 'c', 'focus', 1, 1, 2, 0, 1, 'completed', 0);",
    );
    let got = store.read(counts).expect("counts");
    assert_eq!(
        got,
        Counts {
            sessions: 1,
            presets: base + 1,
            notes: 1,
            settings: fresh.settings + 2,
            ..Counts::default()
        }
    );
}

#[test]
fn counts_routines_tables_skip_tombstones() {
    let store = Store::open_in_memory(DEVICE).expect("opens");
    let fresh = store.read(counts).expect("counts");
    exec(
        &store,
        "INSERT INTO routine (id, name, days, position, created_at, updated_at, deleted_at)
           VALUES ('r1', 'Morning', 127, 0, 0, 0, NULL), ('r2', 'Evening', 127, 1, 0, 0, 5);
         INSERT INTO habit (id, routine_id, position, name, created_at, updated_at, deleted_at)
           VALUES ('h1', 'r1', 0, 'Water', 0, 0, NULL), ('h2', 'r1', 1, 'Stretch', 0, 0, NULL),
                  ('h3', 'r2', 0, 'Read', 0, 0, 5);
         INSERT INTO habit_check (id, habit_id, day, checked_at, deleted_at)
           VALUES ('h1:2026-11-13', 'h1', '2026-11-13', 1, NULL),
                  ('h1:2026-11-14', 'h1', '2026-11-14', 2, 3);
         INSERT INTO routine_run (id, routine_id, day, started_at, ended_at, outcome, steps_total,
             steps_done, steps_skipped, step_ids, answers, updated_at)
           VALUES ('u1', 'r1', '2026-11-13', 1, 2, 'finished', 2, 1, 1, '[\"h1\",\"h2\"]',
                   '[\"done\",\"skipped\"]', 2),
                  ('u2', 'r1', '2026-11-14', 3, NULL, NULL, 2, 0, 0, '[\"h1\",\"h2\"]', '[]', 3);",
    );
    let got = store.read(counts).expect("counts");
    assert_eq!(
        got,
        Counts {
            routines: 1,
            habits: 2,
            checks: 1,
            runs: 2,
            ..fresh
        }
    );
}

#[test]
fn counts_reflections_skip_tombstones() {
    let store = Store::open_in_memory(DEVICE).expect("opens");
    exec(
        &store,
        "INSERT INTO reflection (id, kind, period, created_at, updated_at, deleted_at)
           VALUES ('shutdown:2026-11-16', 'shutdown', '2026-11-16', 1, 1, NULL),
                  ('shutdown:2026-11-17', 'shutdown', '2026-11-17', 1, 1, 5),
                  ('week:2026-11-23', 'week', '2026-11-23', 1, 1, NULL);",
    );
    assert_eq!(store.read(counts).expect("counts").reflections, 2);
}
