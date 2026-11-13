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
            settings: fresh.settings + 2
        }
    );
}
