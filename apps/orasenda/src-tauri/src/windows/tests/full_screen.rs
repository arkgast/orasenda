//! The full-screen sequencer behind a fake of `main`: the fake answers a request with the
//! notification AppKit would post (or none), so each test is one sequence.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::ipc::{FullScreenError, FullScreenErrorKind, WindowView};
use crate::windows::full_screen::{FsOps, FullScreen, Observed, TRANSITION_TIMEOUT};

/// What the fake does when asked to change full screen.
#[derive(Clone, Copy, PartialEq)]
enum Reply {
    /// Posts did-enter or did-exit at once.
    Ack,
    /// Posts did-fail.
    FailEvent,
    /// Posts nothing.
    Silent,
    /// `set_fullscreen` itself errors.
    Refuse,
}

struct Fake {
    fs: Arc<FullScreen>,
    calls: Mutex<Vec<String>>,
    published: Mutex<Vec<WindowView>>,
    visible: Mutex<bool>,
    minimized: Mutex<bool>,
    display: Mutex<String>,
    reply: Mutex<Reply>,
    /// The first `set_full_screen` waits for this before it answers.
    gate: Mutex<Option<Receiver<()>>>,
    entries: Mutex<u8>,
    opened: Mutex<u32>,
}

impl Fake {
    fn new(fs: &Arc<FullScreen>) -> Arc<Self> {
        Arc::new(Self {
            fs: Arc::clone(fs),
            calls: Mutex::default(),
            published: Mutex::default(),
            visible: Mutex::new(true),
            minimized: Mutex::new(false),
            display: Mutex::new("a".into()),
            reply: Mutex::new(Reply::Ack),
            gate: Mutex::default(),
            entries: Mutex::default(),
            opened: Mutex::default(),
        })
    }

    fn note(&self, call: impl Into<String>) {
        self.calls.lock().unwrap().push(call.into());
    }

    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    fn set_reply(&self, reply: Reply) {
        *self.reply.lock().unwrap() = reply;
    }

    fn last_published(&self) -> WindowView {
        self.published
            .lock()
            .unwrap()
            .last()
            .cloned()
            .expect("a view was published")
    }
}

impl FsOps for Fake {
    fn visible(&self) -> bool {
        *self.visible.lock().unwrap()
    }
    fn minimized(&self) -> bool {
        *self.minimized.lock().unwrap()
    }
    fn show(&self) -> Result<(), FullScreenError> {
        self.note("show");
        *self.visible.lock().unwrap() = true;
        Ok(())
    }
    fn unminimize(&self) -> Result<(), FullScreenError> {
        self.note("unminimize");
        *self.minimized.lock().unwrap() = false;
        Ok(())
    }
    fn set_full_screen(&self, on: bool) -> Result<(), FullScreenError> {
        self.note(format!("set({on})"));
        if let Some(gate) = self.gate.lock().unwrap().take() {
            gate.recv().expect("released");
        }
        match *self.reply.lock().unwrap() {
            Reply::Ack => {
                let event = if on {
                    Observed::Entered
                } else {
                    Observed::Exited
                };
                self.fs.handle(self, event);
            }
            Reply::FailEvent => self.fs.handle(self, Observed::Failed),
            Reply::Silent => {}
            Reply::Refuse => return Err(FullScreenError::failed("refused")),
        }
        Ok(())
    }
    fn hide(&self) -> Result<(), FullScreenError> {
        self.note(format!("hide(on={})", self.fs.is_on()));
        Ok(())
    }
    fn has_display(&self, id: &str) -> bool {
        matches!(id, "a" | "b")
    }
    fn display(&self) -> Option<String> {
        Some(self.display.lock().unwrap().clone())
    }
    fn move_to(&self, id: &str) -> Result<(), FullScreenError> {
        self.note(format!("move({id},on={})", self.fs.is_on()));
        *self.display.lock().unwrap() = id.into();
        Ok(())
    }
    fn hints_left(&self) -> u8 {
        3 - *self.entries.lock().unwrap()
    }
    fn bump_hint(&self) -> u8 {
        let mut entries = self.entries.lock().unwrap();
        let left = 3 - *entries;
        if left > 0 {
            *entries += 1;
        }
        left
    }
    fn note_opened(&self) {
        *self.opened.lock().unwrap() += 1;
    }
    fn publish(&self, view: &WindowView) {
        self.published.lock().unwrap().push(view.clone());
    }
}

fn setup() -> (Arc<FullScreen>, Arc<Fake>) {
    let fs = Arc::new(FullScreen::default());
    let ops = Fake::new(&fs);
    (fs, ops)
}

#[test]
fn enter_leave_sequence() {
    let (fs, ops) = setup();
    fs.enter(&*ops, None).expect("enters");
    assert!(fs.is_on());
    assert_eq!(ops.calls(), ["set(true)"]);
    assert!(ops.last_published().full_screen);
    fs.leave(&*ops).expect("leaves");
    assert!(!fs.is_on());
    assert_eq!(ops.calls(), ["set(true)", "set(false)"]);
    assert!(!ops.last_published().full_screen);
    // Leaving when not in full screen, and entering when there, ask for nothing.
    fs.leave(&*ops).expect("already out");
    fs.enter(&*ops, None).expect("enters");
    fs.enter(&*ops, None).expect("already in");
    assert_eq!(ops.calls(), ["set(true)", "set(false)", "set(true)"]);
}

#[test]
fn move_waits_for_did_exit() {
    let (fs, ops) = setup();
    fs.enter(&*ops, None).expect("enters on a");
    fs.enter(&*ops, Some("b")).expect("moves to b");
    // The move happened after did-exit (on=false) and before the second enter.
    assert_eq!(
        ops.calls(),
        ["set(true)", "set(false)", "move(b,on=false)", "set(true)"]
    );
    assert_eq!(ops.last_published().display.as_deref(), Some("b"));
    assert!(fs.is_on());
    // From out of full screen: move, then enter, no leave.
    fs.leave(&*ops).expect("leaves");
    fs.enter(&*ops, Some("a")).expect("enters on a");
    assert_eq!(
        ops.calls()[4..],
        ["set(false)", "move(a,on=false)", "set(true)"]
    );
    // The display it is on already is "this display".
    fs.enter(&*ops, Some("a")).expect("already there");
    assert_eq!(ops.calls().len(), 7);
}

#[test]
fn unknown_display_is_refused_before_anything_moves() {
    let (fs, ops) = setup();
    let error = fs.enter(&*ops, Some("gone")).expect_err("refused");
    assert_eq!(error.kind, FullScreenErrorKind::NoDisplay);
    assert!(ops.calls().is_empty());
}

#[test]
fn did_fail_ends_transition() {
    let (fs, ops) = setup();
    for reply in [Reply::FailEvent, Reply::Refuse] {
        ops.set_reply(reply);
        let started = Instant::now();
        let error = fs.enter(&*ops, None).expect_err("fails");
        assert_eq!(error.kind, FullScreenErrorKind::Failed);
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "no wait for the timeout"
        );
        assert!(!fs.is_on());
    }
    // The turn is free again.
    ops.set_reply(Reply::Ack);
    fs.enter(&*ops, None).expect("enters");
    // A failed leave keeps full screen.
    ops.set_reply(Reply::FailEvent);
    assert_eq!(
        fs.leave(&*ops).expect_err("fails").kind,
        FullScreenErrorKind::Failed
    );
    assert!(fs.is_on());
}

#[test]
fn timeout_3s_keeps_reported_state() {
    assert_eq!(TRANSITION_TIMEOUT, Duration::from_secs(3));
    let fs = Arc::new(FullScreen::with_timeout(Duration::from_millis(60)));
    let ops = Fake::new(&fs);
    ops.set_reply(Reply::Silent);
    let error = fs.enter(&*ops, None).expect_err("times out");
    assert_eq!(error.kind, FullScreenErrorKind::TimedOut);
    assert!(!fs.is_on(), "the reported state is kept");
    // AppKit answers late: the state follows what it reports.
    fs.handle(&*ops, Observed::Entered);
    assert!(fs.is_on());
    assert!(ops.last_published().full_screen);
    // A leave that times out keeps full screen.
    let error = fs.leave(&*ops).expect_err("times out");
    assert_eq!(error.kind, FullScreenErrorKind::TimedOut);
    assert!(fs.is_on());
}

#[test]
fn request_during_transition_waits() {
    let (fs, ops) = setup();
    let (release, gate): (Sender<()>, Receiver<()>) = channel();
    *ops.gate.lock().unwrap() = Some(gate);
    let (fs_a, ops_a) = (Arc::clone(&fs), Arc::clone(&ops));
    let enter = thread::spawn(move || fs_a.enter(&*ops_a, None));
    while ops.calls().is_empty() {
        thread::yield_now();
    }
    let (fs_b, ops_b) = (Arc::clone(&fs), Arc::clone(&ops));
    let leave = thread::spawn(move || {
        // Wait for the enter to finish: this must block until then.
        fs_b.leave(&*ops_b)
    });
    thread::sleep(Duration::from_millis(100));
    assert_eq!(ops.calls(), ["set(true)"], "the leave waits for the enter");
    release.send(()).unwrap();
    enter.join().unwrap().expect("enters");
    leave.join().unwrap().expect("leaves");
    assert_eq!(ops.calls(), ["set(true)", "set(false)"]);
    assert!(!fs.is_on());
}

#[test]
fn enter_while_hidden_shows_first() {
    let (fs, ops) = setup();
    *ops.visible.lock().unwrap() = false;
    fs.enter(&*ops, None).expect("enters");
    assert_eq!(ops.calls(), ["show", "set(true)"]);
}

#[test]
fn enter_while_minimized_deminiaturizes_first() {
    let (fs, ops) = setup();
    *ops.minimized.lock().unwrap() = true;
    fs.enter(&*ops, None).expect("enters");
    assert_eq!(ops.calls(), ["unminimize", "set(true)"]);
}

#[test]
fn close_waits_for_did_exit() {
    let (fs, ops) = setup();
    fs.enter(&*ops, None).expect("enters");
    fs.close_main(&*ops).expect("closes");
    // `hide` ran after did-exit.
    assert_eq!(ops.calls(), ["set(true)", "set(false)", "hide(on=false)"]);
    // Not in full screen: it only hides.
    fs.close_main(&*ops).expect("hides");
    assert_eq!(ops.calls()[3..], ["hide(on=false)"]);
    // When leaving fails the window is left as it is.
    fs.enter(&*ops, None).expect("enters");
    ops.set_reply(Reply::FailEvent);
    assert!(fs.close_main(&*ops).is_err());
    let hides = ops
        .calls()
        .iter()
        .filter(|call| call.starts_with("hide"))
        .count();
    assert_eq!(hides, 2, "a failed leave hides nothing");
    assert!(fs.is_on());
}

/// Guards only the in-memory state; AppKit restoring the window after a quit is an owner check.
#[test]
fn quit_in_full_screen_relaunch_normal() {
    let (fs, ops) = setup();
    fs.enter(&*ops, None).expect("enters");
    assert!(fs.is_on());
    // The state is in memory only: a new run knows nothing of the old one.
    let relaunched = Arc::new(FullScreen::default());
    let fresh = Fake::new(&relaunched);
    assert!(!relaunched.is_on());
    let view = relaunched.view(&*fresh);
    assert!(!view.full_screen);
    // Leaving does not ask AppKit for anything.
    relaunched.leave(&*fresh).expect("nothing to leave");
    assert!(fresh.calls().is_empty());
}

#[test]
fn window_view_getter_matches_event() {
    let (fs, ops) = setup();
    assert_eq!(
        fs.view(&*ops),
        WindowView {
            full_screen: false,
            display: Some("a".into()),
            hints_left: 3
        }
    );
    for (entry, left) in [(1, 3), (2, 2), (3, 1), (4, 0)] {
        fs.enter(&*ops, None).expect("enters");
        let event = ops.last_published();
        assert_eq!(event.hints_left, left, "entry {entry}");
        assert!(event.full_screen);
        assert_eq!(
            fs.view(&*ops),
            event,
            "the getter matches the event, entry {entry}"
        );
        fs.leave(&*ops).expect("leaves");
        let event = ops.last_published();
        assert!(!event.full_screen);
        assert_eq!(fs.view(&*ops), event);
    }
    // AppKit left on its own: the state follows it.
    fs.enter(&*ops, None).expect("enters");
    fs.handle(&*ops, Observed::Exited);
    assert!(!fs.view(&*ops).full_screen);
    assert_eq!(fs.view(&*ops), ops.last_published());
}

#[test]
fn view_between_did_enter_and_the_count_reads_the_store() {
    let (fs, ops) = setup();
    // The notification block recorded the entry; the events thread has not counted it yet.
    fs.observe(Observed::Entered);
    let before = fs.view(&*ops);
    assert!(before.full_screen);
    assert_eq!(before.hints_left, 3, "the store's count, not a stale one");
    fs.after_event(&*ops, Observed::Entered);
    assert_eq!(fs.view(&*ops).hints_left, 3, "the count of this entry");
    assert_eq!(ops.last_published().hints_left, 3);
    // The next entry reads the store (2 left) in the same gap.
    fs.handle(&*ops, Observed::Exited);
    fs.observe(Observed::Entered);
    assert_eq!(fs.view(&*ops).hints_left, 2);
}

#[test]
fn every_entry_ends_the_focus_view_tip() {
    let (fs, ops) = setup();
    for entry in 1..=5 {
        fs.enter(&*ops, None).expect("enters");
        assert_eq!(*ops.opened.lock().unwrap(), entry, "entry {entry}");
        fs.leave(&*ops).expect("leaves");
    }
    // A did-fail and a did-exit do not count as an open.
    fs.handle(&*ops, Observed::Failed);
    assert_eq!(*ops.opened.lock().unwrap(), 5);
}
