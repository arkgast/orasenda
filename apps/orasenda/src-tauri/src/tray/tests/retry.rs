//! Tests for failed draws, retries and re-entrant renders.

use std::sync::Mutex;

use super::state::Drawn;
use super::*;

/// A failed call is logged and the draw is posted again after a delay, redoing every
/// call. The main thread runs posts inline here, as Tauri does when already on it: the
/// retry still waits for its delay instead of running back to back.
#[test]
fn failed_tray_call_is_retried_without_a_new_render() {
    let (tray, calls) = tray_with(Recorder::default());
    tray.render(&running(S59));
    calls.take();

    // While idle no further render comes, so the retry is the only way back.
    *calls.title_failures.lock().unwrap() = 1;
    tray.render(&idle());
    assert_eq!(
        calls.take(),
        full_draw(&idle()),
        "no retry before the delay"
    );
    assert_eq!(calls.delayed_count(), 1);
    assert!(calls.run_delayed());
    assert_eq!(calls.take(), full_draw(&idle()));
    assert_eq!(calls.delayed_count(), 0);

    tray.render(&idle());
    assert_eq!(calls.take(), []);
}

/// A failed accessibility label fails the draw like any other call: the retry sets it
/// again, so VoiceOver is not left reading the previous view's name.
#[test]
fn failed_accessibility_label_is_retried_without_a_new_render() {
    let (tray, calls) = tray_with(Recorder::default());
    tray.render(&running(S59));
    calls.take();

    *calls.label_failures.lock().unwrap() = 1;
    tray.render(&idle());
    assert!(calls.run_delayed());
    let mut expected = full_draw(&idle());
    expected.extend(full_draw(&idle()));
    assert_eq!(calls.take(), expected);

    tray.render(&idle());
    assert_eq!(calls.take(), []);
}

/// A tray that keeps failing is tried once plus [`DRAW_RETRIES`] times per view, then
/// left until the next view.
#[test]
fn failed_draw_retries_are_bounded() {
    let (tray, calls) = tray_with(Recorder {
        title_failures: Mutex::new(u32::MAX),
        ..Recorder::default()
    });
    tray.render(&running(S59));
    while calls.run_delayed() {}
    let titles = calls
        .take()
        .iter()
        .filter(|call| matches!(call, Call::Title(_)))
        .count();
    assert_eq!(titles, 1 + DRAW_RETRIES as usize);

    *calls.title_failures.lock().unwrap() = 0;
    tray.render(&running(S57));
    assert_eq!(calls.take(), full_draw(&running(S57)));
}

/// A retry that finds a newer view waiting leaves the drawing to that view's own draw.
#[test]
fn failed_draw_does_not_retry_over_a_newer_view() {
    let (tray, calls) = tray_with(Recorder {
        queued: true,
        title_failures: Mutex::new(1),
        ..Recorder::default()
    });
    tray.render(&running(S59));
    // The first draw fails; before the retry runs, a newer view arrives.
    let first = calls.queue.lock().unwrap().pop_front().unwrap();
    first();
    tray.render(&running(S58));
    calls.run_queue();
    while calls.run_delayed() {
        calls.run_queue();
    }
    let mut expected = full_draw(&running(S59));
    expected.extend(full_draw(&running(S58)));
    assert_eq!(calls.take(), expected);
}

/// A delayed retry for an older view is dropped once a newer view has rendered, even
/// when that newer view's draw failed too: only the newer view's own retry draws, so
/// the older retry neither draws early nor uses up the newer view's attempts.
#[test]
fn delayed_retry_for_an_older_view_is_dropped() {
    let (tray, calls) = tray_with(Recorder {
        title_failures: Mutex::new(2),
        ..Recorder::default()
    });
    tray.render(&running(S59));
    tray.render(&running(S58));
    calls.take();
    assert_eq!(calls.delayed_count(), 2);

    assert!(calls.run_delayed(), "the older view's retry");
    assert_eq!(calls.take(), [], "the older retry is dropped");
    assert!(calls.run_delayed(), "the newer view's retry");
    assert_eq!(calls.take(), full_draw(&running(S58)));
    assert_eq!(
        lock_state(&tray.state).drawn,
        Some(Drawn::of(
            &running(S58),
            &NextSession::default(),
            &FocusItems::default()
        ))
    );
}

/// Through `publish_view`: idle, then a stale running view (an older number) leaves the
/// tray idle with no title.
#[test]
fn stale_view_through_the_gate_leaves_the_tray_idle() {
    use crate::runtime::session::test_support::TestHost;
    use crate::runtime::ticker::publish_view;

    let host = TestHost::new(NotificationStatus::Granted);
    let (tray, calls) = tray_with(Recorder::default());
    host.0
        .surfaces
        .0
        .lock()
        .unwrap()
        .push(Arc::clone(&tray) as Arc<dyn NativeSurface>);

    publish_view(&host, 1, &running(S59));
    publish_view(&host, 3, &idle());
    calls.take();
    publish_view(&host, 2, &running(S58));
    assert_eq!(calls.take(), []);
    assert_eq!(
        lock_state(&tray.state).drawn,
        Some(Drawn::of(
            &idle(),
            &NextSession::default(),
            &FocusItems::default()
        )),
        "the tray stays idle"
    );
}

/// `render` may be called from `draw`'s own calls (a surface re-entering on the main
/// thread) without deadlocking: no lock is held across a tray call.
#[test]
fn render_from_inside_a_tray_call_does_not_deadlock() {
    struct Reentrant {
        inner: Recorder,
        tray: OnceLock<std::sync::Weak<Tray>>,
    }
    impl TrayHandle for Reentrant {
        fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
            task();
            Ok(())
        }
        fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
            self.inner.after_delay(task)
        }
        fn set_title(&self, title: Option<&str>) -> Result<(), String> {
            if title == Some("24:59")
                && let Some(tray) = self.tray.get().and_then(std::sync::Weak::upgrade)
            {
                tray.render(&running(S58));
            }
            self.inner.set_title(title)
        }
        fn set_tooltip(&self, label: &str) -> Result<(), String> {
            self.inner.set_tooltip(label)
        }
        fn set_accessibility_label(&self, label: &str) -> Result<(), String> {
            self.inner.set_accessibility_label(label)
        }
        fn set_glyph(&self, glyph: Glyph) -> Result<(), String> {
            self.inner.set_glyph(glyph)
        }
        fn set_menu(&self, items: &[MenuEntry], header: Option<&str>) -> Result<(), String> {
            self.inner.set_menu(items, header)
        }
        fn set_header(&self, text: &str) -> Result<(), String> {
            self.inner.set_header(text)
        }
    }

    let handle = Arc::new(Reentrant {
        inner: Recorder::default(),
        tray: OnceLock::new(),
    });
    let tray = Arc::new(Tray::new(handle.clone(), &idle(), NextSession::default()));
    handle
        .inner
        .state
        .set(Arc::clone(&tray.state))
        .ok()
        .unwrap();
    handle.tray.set(Arc::downgrade(&tray)).ok().unwrap();

    let (done, finished) = std::sync::mpsc::channel();
    let worker = {
        let tray = Arc::clone(&tray);
        std::thread::spawn(move || {
            tray.render(&running(S59));
            done.send(()).unwrap();
        })
    };
    finished
        .recv_timeout(std::time::Duration::from_secs(5))
        .expect("rendered without deadlock");
    worker.join().unwrap();
    assert!(handle.inner.take().contains(&title("24:58")));
}
