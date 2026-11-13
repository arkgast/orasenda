use crate::portability::rows;
use crate::{Store, presets, settings};

#[test]
fn rows_include_tombstones() {
    let store = Store::open_in_memory("device-a").expect("opens");
    super::merge::seed(&store);
    let all = store.read(rows).expect("reads");
    assert_eq!(all.settings.len(), 1);
    assert_eq!(all.presets.len(), 2);
    assert!(all.presets.iter().any(|p| p.deleted_at == Some(500)));
    assert_eq!(all.sessions.len(), 1);
    assert_eq!(all.sessions[0].intent.as_deref(), Some("Outline"));
    assert_eq!(all.notes.len(), 2);
    assert!(all.notes.iter().any(|n| n.deleted_at == Some(700)));
    // The live reads of the repositories do not show the tombstones.
    let live = store.read(presets::list).expect("reads").len();
    assert_eq!(live, 1);
    let value: Option<String> = store
        .read(|txn| settings::get(txn, "theme"))
        .expect("reads");
    assert_eq!(value.as_deref(), Some("dark"));
}
