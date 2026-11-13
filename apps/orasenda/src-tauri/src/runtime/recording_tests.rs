use std::cell::RefCell;

use super::recording::{Leave, Recording, Suspender};

#[derive(Default)]
struct Fake {
    log: RefCell<Vec<&'static str>>,
}

impl Suspender for &Fake {
    fn suspend(&self) {
        self.log.borrow_mut().push("suspend");
    }
    fn restore(&self) {
        self.log.borrow_mut().push("restore");
    }
}

fn log(fake: &Fake) -> Vec<&'static str> {
    fake.log.borrow().clone()
}

#[test]
fn recording_on_suspends_and_off_restores() {
    let fake = Fake::default();
    let recording = Recording::new(&fake);
    recording.set(true);
    assert!(recording.is_on());
    recording.set(false);
    assert!(!recording.is_on());
    assert_eq!(log(&fake), ["suspend", "restore"]);
}

#[test]
fn recording_on_twice_off_once_restores() {
    let fake = Fake::default();
    let recording = Recording::new(&fake);
    recording.set(true);
    recording.set(true);
    recording.set(false);
    assert_eq!(log(&fake), ["suspend", "restore"]);
    assert!(!recording.is_on());
}

#[test]
fn recording_off_without_on_does_nothing() {
    let fake = Fake::default();
    Recording::new(&fake).set(false);
    assert!(log(&fake).is_empty());
}

fn restored_on(how: Leave) {
    let fake = Fake::default();
    let recording = Recording::new(&fake);
    recording.set(true);
    recording.left(how);
    assert!(!recording.is_on());
    assert_eq!(log(&fake), ["suspend", "restore"]);
    // A later webview `off` after Rust restored does not restore twice.
    recording.set(false);
    assert_eq!(log(&fake), ["suspend", "restore"]);
}

#[test]
fn recording_restored_on_blur() {
    restored_on(Leave::Blur);
}

#[test]
fn recording_restored_on_close() {
    restored_on(Leave::Close);
}

#[test]
fn recording_restored_on_reload() {
    restored_on(Leave::Reload);
}

#[test]
fn leaving_when_not_recording_restores_nothing() {
    let fake = Fake::default();
    Recording::new(&fake).left(Leave::Blur);
    assert!(log(&fake).is_empty());
}

#[test]
fn relaunch_starts_unsuspended() {
    let fake = Fake::default();
    let first = Recording::new(&fake);
    first.set(true);
    // A new process builds a new Recording: nothing is read back from disk.
    let second = Recording::new(&fake);
    assert!(!second.is_on());
    assert_eq!(log(&fake), ["suspend"]);
}

mod threads {
    use std::sync::mpsc::{Receiver, channel};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    use orasenda_service::api::ShortcutId;
    use tauri_plugin_global_shortcut::Shortcut;

    use super::super::recording::{Globals, Leave, Recording, Suspender};
    use crate::shortcuts::{Backend, Held};

    /// A restore that waits for a release, as the plugin waits for the main thread.
    struct Slow(Mutex<Receiver<()>>);
    impl Suspender for Slow {
        fn suspend(&self) {}
        fn restore(&self) {
            let _ = self.0.lock().unwrap().recv_timeout(Duration::from_secs(10));
        }
    }

    #[test]
    fn leaving_never_waits_on_a_restore_in_flight() {
        let (release, wait) = channel();
        let recording = Arc::new(Recording::new(Slow(Mutex::new(wait))));
        recording.set(true);
        let busy = Arc::clone(&recording);
        let off = std::thread::spawn(move || busy.set(false));
        std::thread::sleep(Duration::from_millis(100));
        let started = Instant::now();
        recording.left_detached(Leave::Blur);
        assert!(started.elapsed() < Duration::from_secs(1));
        release.send(()).unwrap();
        off.join().unwrap();
        for _ in 0..100 {
            if !recording.is_on() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("still on");
    }

    #[derive(Default)]
    struct Calls(Mutex<Vec<String>>);
    impl Backend for Arc<Calls> {
        fn register(&self, shortcut: Shortcut) -> Result<(), String> {
            self.0.lock().unwrap().push(format!("+{}", shortcut.id()));
            Ok(())
        }
        fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
            self.0.lock().unwrap().push(format!("-{}", shortcut.id()));
            Ok(())
        }
    }

    #[test]
    fn globals_unregister_every_held_shortcut_and_register_them_again() {
        let held = Arc::new(Held::default());
        let shortcut: Shortcut = "Control+Alt+G".parse().unwrap();
        held.insert_for_test(ShortcutId::StartPause, shortcut);
        let calls = Arc::new(Calls::default());
        let globals = Globals::new(Arc::clone(&calls), held);
        globals.suspend();
        globals.restore();
        let id = shortcut.id();
        assert_eq!(
            *calls.0.lock().unwrap(),
            [format!("-{id}"), format!("+{id}")]
        );
    }
}
