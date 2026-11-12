//! Fakes shared by the session and scheduler tests: a recording host, notifier, keep-awake
//! and local time, all writing to one ordered [`Log`].

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use orasenda_core::{
    HourCycle, KeepAwake, LocalTime, NotificationStatus, Notifier, PlatformError, PresetId,
    SessionId,
};
use orasenda_store::Store;

use crate::api::ClockTick;
use crate::api::{MilestoneEvent, PresetEntry, Settings, StartRequest, Theme, TimerView};
use crate::scheduler::Host;
use crate::session::{Action, Platform, SessionService, Surfaces, ViewGate};

/// 2026-11-07 00:00:00 UTC.
pub const T0: u64 = 1_794_009_600_000;
pub const MINUTE: u64 = 60_000;
pub const CLASSIC_MS: u64 = 25 * MINUTE;
/// When a classic session is over for good: its focus, then its 5-minute break.
pub const CLASSIC_END_MS: u64 = CLASSIC_MS + 5 * MINUTE;
/// The fake local time: one hour east of UTC, 12-hour clock.
pub const OFFSET_MIN: i32 = 60;
pub const CYCLE: HourCycle = HourCycle::H12;

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Tick(TimerView),
    Milestone(MilestoneEvent),
    Clock(ClockTick),
    Render(TimerView),
    StatusRead,
    Requested,
    Posted(String, String),
    Begun,
    Released,
    SettingsChanged(Settings),
    PresetsChanged(Vec<PresetEntry>),
    ApplyTheme(Theme),
    OpenedSettings,
}

#[derive(Clone, Default)]
pub struct Log(Arc<Mutex<Vec<Event>>>);

impl Log {
    pub fn push(&self, event: Event) {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(event);
    }

    pub fn take(&self) -> Vec<Event> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }

    pub fn count(&self, matches: impl Fn(&Event) -> bool) -> usize {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .filter(|event| matches(event))
            .count()
    }
}

pub struct FakeKeepAwake {
    pub log: Log,
    pub fail: bool,
}

struct Guard(Log);

impl Drop for Guard {
    fn drop(&mut self) {
        self.0.push(Event::Released);
    }
}

impl KeepAwake for FakeKeepAwake {
    fn begin(&self, _reason: &str) -> Result<Box<dyn std::any::Any + Send>, PlatformError> {
        if self.fail {
            return Err(PlatformError::Refused);
        }
        self.log.push(Event::Begun);
        Ok(Box::new(Guard(self.log.clone())))
    }
}

pub struct FakeLocalTime;

impl LocalTime for FakeLocalTime {
    fn utc_offset_min(&self, _at_epoch_ms: u64) -> i32 {
        OFFSET_MIN
    }

    fn hour_cycle(&self) -> HourCycle {
        CYCLE
    }
}

type Answer = Box<dyn FnOnce(NotificationStatus) + Send>;

pub struct FakeNotifier {
    log: Log,
    status: Mutex<NotificationStatus>,
    answers: Mutex<Vec<Answer>>,
    /// When set, `status` logs the read and then blocks until the gate is released.
    gate: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
    panic_on_status: std::sync::atomic::AtomicBool,
}

impl FakeNotifier {
    pub fn set_status(&self, status: NotificationStatus) {
        *self.status.lock().unwrap_or_else(PoisonError::into_inner) = status;
    }

    /// Holds every `status` read until the returned sender sends or drops.
    pub fn gate_status(&self) -> std::sync::mpsc::Sender<()> {
        let (tx, rx) = std::sync::mpsc::channel();
        *self.gate.lock().unwrap_or_else(PoisonError::into_inner) = Some(rx);
        tx
    }

    /// Makes `status` panic (after logging the read) while `on`.
    pub fn panic_on_status(&self, on: bool) {
        self.panic_on_status.store(on, Ordering::SeqCst);
    }

    /// Answers the oldest open request, as the OS would on a Foundation thread.
    pub fn answer(&self, status: NotificationStatus) {
        self.set_status(status);
        let answer = self
            .answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(0);
        answer(status);
    }
}

impl Notifier for FakeNotifier {
    fn status(&self) -> NotificationStatus {
        self.log.push(Event::StatusRead);
        assert!(
            !self.panic_on_status.load(Ordering::SeqCst),
            "fake status read panics"
        );
        if let Some(rx) = self
            .gate
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
        {
            let _ = rx.recv();
        }
        *self.status.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn request(&self, done: Answer) {
        self.log.push(Event::Requested);
        self.answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(done);
    }

    fn post(&self, title: &str, body: &str) -> Result<(), PlatformError> {
        self.log.push(Event::Posted(title.into(), body.into()));
        Ok(())
    }

    fn open_settings(&self) -> Result<(), PlatformError> {
        self.log.push(Event::OpenedSettings);
        Ok(())
    }
}

pub struct Fakes {
    pub platform: Platform,
    pub log: Log,
    pub notifier: Arc<FakeNotifier>,
}

pub fn fakes(status: NotificationStatus, keep_awake_fails: bool) -> Fakes {
    let log = Log::default();
    let notifier = Arc::new(FakeNotifier {
        log: log.clone(),
        status: Mutex::new(status),
        answers: Mutex::new(Vec::new()),
        gate: Mutex::new(None),
        panic_on_status: std::sync::atomic::AtomicBool::new(false),
    });
    Fakes {
        platform: Platform {
            keep_awake: Box::new(FakeKeepAwake {
                log: log.clone(),
                fail: keep_awake_fails,
            }),
            local_time: Box::new(FakeLocalTime),
            notifier: notifier.clone(),
        },
        log,
        notifier,
    }
}

/// The service's store, for the store's test hooks.
pub fn db(service: &SessionService) -> &Store {
    service.store.as_ref().expect("the service has a store")
}

pub fn memory_store() -> Store {
    Store::open_in_memory("device-test").expect("in-memory store opens")
}

/// A service on a fresh in-memory store, notification status not determined.
pub fn service() -> SessionService {
    SessionService::new(
        Ok(memory_store()),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    )
}

/// Starts the selected preset.
pub fn start() -> Action {
    Action::Start(StartRequest { quick: false })
}

/// Starts the built-in two-minute focus.
pub fn start_quick() -> Action {
    Action::Start(StartRequest { quick: true })
}

/// The id of default `index`: 0 Gentle Start, 1 Steady Focus, 2 Deep Work.
pub fn default_id(index: usize) -> PresetId {
    orasenda_core::default_presets()[index].id.clone()
}

/// The snapshot a session keeps of default `index`.
pub fn library_preset(index: usize) -> orasenda_core::SessionPreset {
    let d = &orasenda_core::default_presets()[index];
    orasenda_core::SessionPreset::Library {
        id: d.id.clone(),
        name: d.name.clone(),
        focus_min: d.focus_min,
        break_min: d.break_min,
        long_break_min: d.long_break_min,
        rounds: d.rounds,
    }
}

pub fn id(text: &str) -> impl FnOnce() -> SessionId + use<> {
    let text = text.to_owned();
    move || SessionId(text)
}

pub struct HostInner {
    pub service: Mutex<SessionService>,
    pub surfaces: Surfaces,
    pub gate: ViewGate,
    pub notifier: Arc<FakeNotifier>,
    pub now: AtomicU64,
    pub log: Log,
    /// How many host hooks that must run unlocked found the service locked.
    pub under_lock: std::sync::atomic::AtomicUsize,
}

/// A recording [`Host`]: emits and renders go to the log.
#[derive(Clone)]
pub struct TestHost(pub Arc<HostInner>);

impl TestHost {
    /// A host for a user who turned notifications on (`notify.session_end` is stored as
    /// `true`). Use [`TestHost::fresh`] for fresh-install semantics.
    pub fn new(status: NotificationStatus) -> TestHost {
        let store = memory_store();
        store
            .write(0, |txn| {
                orasenda_store::settings::set(txn, "notify.session_end", &true)
            })
            .expect("seeds the notify preference");
        TestHost::on_store(store, status)
    }

    /// A host on a fresh install: the defaults, notifications off.
    pub fn fresh(status: NotificationStatus) -> TestHost {
        TestHost::on_store(memory_store(), status)
    }

    fn on_store(store: Store, status: NotificationStatus) -> TestHost {
        let Fakes {
            platform,
            log,
            notifier,
        } = fakes(status, false);
        TestHost::with(SessionService::new(Ok(store), platform, T0), log, notifier)
    }

    pub fn with(service: SessionService, log: Log, notifier: Arc<FakeNotifier>) -> TestHost {
        TestHost(Arc::new(HostInner {
            service: Mutex::new(service),
            surfaces: Surfaces::default(),
            gate: ViewGate::default(),
            notifier,
            now: AtomicU64::new(T0),
            log,
            under_lock: std::sync::atomic::AtomicUsize::new(0),
        }))
    }

    /// Counts a violation when the service is locked. Never asserts: publishing runs inside
    /// `catch_unwind`, which would swallow a panic.
    fn note_unlocked(&self) {
        if self.0.service.try_lock().is_err() {
            self.0.under_lock.fetch_add(1, Ordering::SeqCst);
        }
    }

    pub fn set_now(&self, now_ms: u64) {
        self.0.now.store(now_ms, Ordering::SeqCst);
    }

    pub fn log(&self) -> &Log {
        &self.0.log
    }
}

impl Host for TestHost {
    fn service(&self) -> Option<&Mutex<SessionService>> {
        Some(&self.0.service)
    }

    fn surfaces(&self) -> Option<&Surfaces> {
        Some(&self.0.surfaces)
    }

    fn view_gate(&self) -> Option<&ViewGate> {
        Some(&self.0.gate)
    }

    fn notifier(&self) -> Arc<dyn Notifier> {
        self.0.notifier.clone()
    }

    fn now_ms(&self) -> u64 {
        self.0.now.load(Ordering::SeqCst)
    }

    fn emit_timer_tick(&self, view: &TimerView) {
        self.0.log.push(Event::Tick(view.clone()));
    }

    fn emit_milestone(&self, event: &MilestoneEvent) {
        self.0.log.push(Event::Milestone(event.clone()));
    }

    fn emit_clock_tick(&self, tick: &ClockTick) {
        self.0.log.push(Event::Clock(tick.clone()));
    }

    fn emit_settings_changed(&self, settings: &Settings) {
        self.note_unlocked();
        self.0.log.push(Event::SettingsChanged(settings.clone()));
    }

    fn emit_presets_changed(&self, presets: &[PresetEntry]) {
        self.note_unlocked();
        self.0.log.push(Event::PresetsChanged(presets.to_vec()));
    }

    fn apply_theme(&self, theme: Theme) {
        self.note_unlocked();
        self.0.log.push(Event::ApplyTheme(theme));
    }
}
