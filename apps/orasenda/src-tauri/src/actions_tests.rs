//! The de-duplication of `actions::run`.

use std::time::{Duration, Instant};

use orasenda_service::keyboard::ActionId;

use crate::actions::{DEDUP, Recent};

#[test]
fn run_drops_duplicate_within_300ms() {
    let recent = Recent::default();
    let start = Instant::now();
    assert!(recent.admit(ActionId::Floater, start));
    assert!(!recent.admit(ActionId::Floater, start + Duration::from_millis(299)));
    // Another action is not a duplicate.
    assert!(recent.admit(ActionId::Capture, start + Duration::from_millis(10)));
}

#[test]
fn run_runs_after_window() {
    let recent = Recent::default();
    let start = Instant::now();
    assert!(recent.admit(ActionId::Floater, start));
    assert!(recent.admit(ActionId::Floater, start + DEDUP));
    // The window counts from the last run, not from a dropped request.
    assert!(!recent.admit(
        ActionId::Floater,
        start + DEDUP + Duration::from_millis(100)
    ));
    assert!(recent.admit(ActionId::Floater, start + DEDUP * 2));
}

#[test]
fn window_routes_never_overlap() {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, Barrier};

    let recent = Arc::new(Recent::default());
    let inside = Arc::new(AtomicU32::new(0));
    let overlap = Arc::new(AtomicU32::new(0));
    let start = Arc::new(Barrier::new(2));
    let threads: Vec<_> = (0..2)
        .map(|_| {
            let (recent, inside, overlap, start) = (
                recent.clone(),
                inside.clone(),
                overlap.clone(),
                start.clone(),
            );
            std::thread::spawn(move || {
                start.wait();
                recent.serialized(|| {
                    if inside.fetch_add(1, Ordering::SeqCst) > 0 {
                        overlap.fetch_add(1, Ordering::SeqCst);
                    }
                    std::thread::sleep(Duration::from_millis(50));
                    inside.fetch_sub(1, Ordering::SeqCst);
                });
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    assert_eq!(overlap.load(Ordering::SeqCst), 0);
}
