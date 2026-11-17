//! An import that touched reflections emits `review-changed`, after unlock.

use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};

use super::TempDir;
use super::import::{host_in, source};
use crate::data::import::run_import;
use crate::session::test_support::Event;

fn write_reflection(store: &orasenda_store::Store) {
    let write = ReflectionWrite {
        kind: ReflectionKind::Shutdown,
        period: "2026-11-06".into(),
        went_well: Some("Shipped it".into()),
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: vec![],
        complete: true,
    };
    store
        .write(5, |txn| reflections::upsert(txn, &write))
        .expect("reflection written");
}

#[test]
fn import_with_reflections_emits_review_changed() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(write_reflection);
    host.log().take();
    let report = run_import(&host, dir.path(), &path).expect("imports");
    assert_eq!(report.added.reflections, 1);
    let events = host.log().take();
    assert!(
        events
            .iter()
            .any(|event| matches!(event, Event::ReviewChanged(_))),
        "{events:?}"
    );
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn import_without_reflections_does_not_emit_review_changed() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|_| {});
    host.log().take();
    run_import(&host, dir.path(), &path).expect("imports");
    let events = host.log().take();
    assert!(
        !events
            .iter()
            .any(|event| matches!(event, Event::ReviewChanged(_)))
    );
}
