//! The session service: the engine, the store and the platform behind one lock (ADR-013).
//!
//! Every surface (the webview, the menu bar) acts through [`run_action`] and sees the same
//! [`TimerView`]. The service never emits, renders, notifies or drops a keep-awake guard
//! itself: [`SessionService::apply`], [`SessionService::tick`] and [`SessionService::state`]
//! fill [`Effects`], which [`crate::scheduler::publish`] carries out after the lock is released.

use std::any::Any;
use std::error::Error;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::SystemTime;

use orasenda_core::clock::epoch_ms;
use orasenda_core::{
    EngineState, KeepAwake, LocalTime, Milestone, NotificationStatus, Notifier, Preset, Session,
    SessionId, SessionRecord, TimerError, format_clock, format_remaining, spoken_remaining,
};
use orasenda_store::{OpenError, Store, StoreError, Txn, active_session, focus_sessions, settings};
use serde::de::DeserializeOwned;
use tauri::Manager;
use uuid::Uuid;

use crate::ClockTick;
use crate::ipc::{
    MilestoneEvent, MilestoneKind, Mode, SettingsError, SettingsErrorKind, StartRequest,
    StoreStatus, TimerCommandError, TimerCommandErrorKind, TimerSettings, TimerState, TimerView,
};
use crate::scheduler::{self, Host};

/// The OS services the session uses. The notifier is also managed on its own
/// (`tauri::State<Arc<dyn Notifier>>`), so `publish` reaches it without the service lock.
pub struct Platform {
    pub keep_awake: Box<dyn KeepAwake>,
    pub local_time: Box<dyn LocalTime>,
    pub notifier: Arc<dyn Notifier>,
}

/// What a surface asks the session to do.
pub enum Action {
    Start(StartRequest),
    Pause,
    Resume,
    Stop,
}

/// Everything the caller does after unlocking, in the order [`crate::scheduler::publish`]
/// does it.
pub struct Effects {
    /// The view after the call.
    pub view: TimerView,
    /// Whether the engine was idle before the call.
    pub was_idle: bool,
    /// Whether a tick's retried read or flush changed the store status. The view is then
    /// published even while idle, so the "can't save" line follows the status. Commands
    /// leave it false: they publish whenever they change anything shown.
    pub store_changed: bool,
    /// What the command returns. Its `Ok` is always `view`.
    pub result: Result<TimerView, TimerCommandError>,
    /// Emitted as `timer-milestone`, in order.
    pub milestones: Vec<MilestoneEvent>,
    /// The session that ended during the call, if one did.
    pub ended: Option<SessionRecord>,
    /// Whether the user wants a notification at a completed end.
    pub notify_session_end: bool,
    /// The keep-awake guard to drop once the lock is released.
    pub drop_after_unlock: Option<Box<dyn Any + Send>>,
    /// Whether to ask for the notification permission (a start while it is not determined).
    pub request_notifications: bool,
    /// Orders `view` against every other published view (see [`ViewGate`]).
    pub seq: u64,
}

/// A native view of the timer (T9's menu-bar item).
pub trait NativeSurface: Send + Sync {
    fn render(&self, view: &TimerView);
}

/// Every native surface, in managed state. `publish` clones the list under the lock and
/// renders after releasing it, so a surface may lock it again.
#[derive(Default)]
pub struct Surfaces(pub Mutex<Vec<Arc<dyn NativeSurface>>>);

/// The number of the last view published as `timer-tick` and to the surfaces, in managed
/// state. Every view is numbered under the service lock ([`Effects::seq`],
/// [`SessionService::snapshot`]); `scheduler::publish_view` drops a view whose number is not
/// newer, so a view taken before a command can't be published after the command's own.
#[derive(Default)]
pub struct ViewGate(pub Mutex<u64>);

/// The live session, the store and the cached settings. Held in managed state as
/// `Mutex<SessionService>`; lock it with [`lock`].
pub struct SessionService {
    engine: Session,
    store: Option<Store>,
    store_status: StoreStatus,
    settings: TimerSettings,
    unsaved: Vec<SessionRecord>,
    snapshot_dirty: bool,
    keep_awake: Option<Box<dyn Any + Send>>,
    notifications: Option<NotificationStatus>,
    pending: Vec<MilestoneEvent>,
    /// True once `timer_state` has drained `pending`: a webview is listening, so a
    /// `recovered` event created later (a retried read, an idle flush) goes out with the next
    /// [`Effects`] as a `timer-milestone` instead of waiting there. One recorded by a
    /// transition is dropped: that transition dismisses one-shot notices anyway.
    listening: bool,
    platform: Platform,
    recover_owed: RecoverOwed,
    /// The number given to the last view handed out (see [`ViewGate`]).
    view_seq: u64,
}

/// Launch reads that failed at the database level and are still owed (architect ruling on
/// #91). `tick` retries them, at most one read attempt a tick.
#[derive(Debug, Default, Clone, Copy)]
struct RecoverOwed {
    /// The settings were not read; a settings write clears this half.
    settings: bool,
    /// The `active_session` row was not read; a write records any session it finds there.
    snapshot: bool,
}

impl RecoverOwed {
    fn any(self) -> bool {
        self.settings || self.snapshot
    }
}

/// Settings keys (spec: Store).
const KEY_PRESET: &str = "timer.preset";
const KEY_CUSTOM: &str = "timer.custom";
const KEY_NOTIFY: &str = "notify.session_end";
const DB_FILE: &str = "orasenda.db";
const KEEP_AWAKE_REASON: &str = "Focus session";

/// What a transition adds to [`Effects`] besides the view and the result.
#[derive(Default)]
struct Outcome {
    milestones: Vec<MilestoneEvent>,
    ended: Option<SessionRecord>,
    drop_after_unlock: Option<Box<dyn Any + Send>>,
    request_notifications: bool,
}

impl SessionService {
    /// Loads the settings and runs relaunch recovery against `now_ms` (spec: Relaunch
    /// recovery). A store that failed to open leaves the engine idle and in memory.
    pub fn new(store: Result<Store, OpenError>, platform: Platform, now_ms: u64) -> SessionService {
        let (store, store_status) = match store {
            Ok(store) => (Some(store), StoreStatus::Ok),
            Err(error @ OpenError::Newer { .. }) => {
                eprintln!("store: {error}; running without saving");
                (None, StoreStatus::Newer)
            }
            Err(error) => {
                eprintln!("store: {error}; running without saving");
                (None, StoreStatus::Unavailable)
            }
        };
        let mut service = SessionService {
            engine: Session::Idle,
            store,
            store_status,
            settings: TimerSettings::default(),
            unsaved: Vec::new(),
            snapshot_dirty: false,
            keep_awake: None,
            notifications: None,
            pending: Vec::new(),
            listening: false,
            platform,
            recover_owed: RecoverOwed::default(),
            view_seq: 0,
        };
        if let Some(read) = service
            .store
            .as_ref()
            .map(|store| store.read(read_settings))
        {
            service.load_settings(read);
        }
        if let Some(read) = service
            .store
            .as_ref()
            .map(|store| store.read(active_session::get::<Session>))
        {
            service.recover(read, now_ms);
        }
        service
    }

    /// The launch read of the settings. A failure keeps the defaults for now, owes the read
    /// to `tick` and shows the store as unavailable.
    fn load_settings(&mut self, read: Result<TimerSettings, StoreError>) {
        match read {
            Ok(settings) => self.settings = settings,
            Err(error) => {
                eprintln!("settings: could not be read ({error}); using the defaults for now");
                self.recover_owed.settings = true;
                self.store_status = StoreStatus::Unavailable;
            }
        }
    }

    /// Relaunch recovery from a read of `active_session`. True when it wrote (a session that
    /// ended while Orasenda was closed).
    fn recover(&mut self, read: Result<Option<Session>, StoreError>, now_ms: u64) -> bool {
        let mut snapshot = match read {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => return false,
            // Left in place: a later build may read it, and nothing here can repair it.
            Err(StoreError::Json(error)) => {
                eprintln!("store: the saved session could not be decoded ({error}); starting idle");
                return false;
            }
            Err(error) => {
                eprintln!("store: the saved session could not be read ({error}); retrying");
                self.recover_owed.snapshot = true;
                self.store_status = StoreStatus::Unavailable;
                return false;
            }
        };
        if let Some(Milestone::Ended(record)) = snapshot.advance(now_ms) {
            self.pending.push(recovered(&record));
            self.persist(now_ms, Some(record));
            return true;
        }
        self.engine = snapshot;
        if !self.engine.is_idle() {
            self.keep_awake = self.begin_keep_awake();
        }
        false
    }

    /// Retries the owed launch reads in one read transaction. The snapshot is read only
    /// while nothing has happened since launch (engine idle, nothing owed to the store);
    /// otherwise the next write records it. True when recovery wrote.
    fn retry_recovery(&mut self, now_ms: u64) -> bool {
        let owed = self.recover_owed;
        let want_snapshot = owed.snapshot
            && self.engine.is_idle()
            && !self.snapshot_dirty
            && self.unsaved.is_empty();
        if !owed.settings && !want_snapshot {
            return false;
        }
        let Some(store) = &self.store else {
            return false;
        };
        let read = store.read(|txn| {
            let settings = if owed.settings {
                Some(read_settings(txn)?)
            } else {
                None
            };
            // A decode error is kept apart: it is not a read failure (see `recover`).
            let snapshot = want_snapshot.then(|| active_session::get::<Session>(txn));
            if let Some(Err(error)) = &snapshot
                && !matches!(error, StoreError::Json(_))
            {
                return Err(error.clone());
            }
            Ok((settings, snapshot))
        });
        // Still failing: already logged when the debt began.
        let Ok((settings, snapshot)) = read else {
            return false;
        };
        if let Some(settings) = settings {
            self.settings = settings;
            self.recover_owed.settings = false;
        }
        let mut wrote = false;
        if let Some(snapshot) = snapshot {
            self.recover_owed.snapshot = false;
            wrote = self.recover(snapshot, now_ms);
        }
        self.refresh_status();
        wrote
    }

    /// Back to `ok` once nothing is owed to or from the store.
    fn refresh_status(&mut self) {
        let owes_nothing =
            !self.recover_owed.any() && !self.snapshot_dirty && self.unsaved.is_empty();
        if owes_nothing && self.store.is_some() {
            self.store_status = StoreStatus::Ok;
        }
    }

    /// Advances first (a command after the planned end completes the session), then acts
    /// on the engine. Always returns [`Effects`]; the command's outcome is `result`.
    pub fn apply(
        &mut self,
        action: Action,
        now_ms: u64,
        new_id: impl FnOnce() -> SessionId,
    ) -> Effects {
        let was_idle = self.engine.is_idle();
        let mut outcome = Outcome::default();
        self.advance(now_ms, &mut outcome);
        let result = match action {
            Action::Start(request) => self.start(&request, now_ms, new_id, &mut outcome),
            Action::Pause => self.engine.pause(now_ms).map(|()| {
                self.changed(now_ms, MilestoneKind::Paused, &mut outcome);
            }),
            Action::Resume => self.engine.resume(now_ms).map(|()| {
                self.changed(now_ms, MilestoneKind::Resumed, &mut outcome);
            }),
            Action::Stop => self.engine.stop(now_ms).map(|record| {
                self.end(record, now_ms, &mut outcome);
            }),
        };
        self.effects(
            now_ms,
            was_idle,
            outcome,
            result.map_err(TimerCommandError::from),
        )
    }

    /// The scheduler's once-a-second step: advance; write an end together with anything
    /// owed, or else retry owed launch reads and then what is owed to the store. At most one
    /// read and one write attempt.
    pub fn tick(&mut self, now_ms: u64) -> Effects {
        let was_idle = self.engine.is_idle();
        let mut outcome = Outcome::default();
        let mut store_changed = false;
        if !self.advance(now_ms, &mut outcome) {
            let before = self.store_status;
            if !self.retry_recovery(now_ms) {
                self.flush(now_ms);
            }
            store_changed = self.store_status != before;
        }
        let mut effects = self.effects(now_ms, was_idle, outcome, Ok(()));
        effects.store_changed = store_changed;
        effects
    }

    /// `timer_state`: a [`SessionService::tick`], plus the drained `pending`.
    pub fn state(&mut self, now_ms: u64) -> (TimerState, Effects) {
        let effects = self.tick(now_ms);
        let state = TimerState {
            view: effects.view.clone(),
            pending: std::mem::take(&mut self.pending),
        };
        self.listening = true;
        (state, effects)
    }

    /// The view at `now_ms` with the next publish number, for a path that publishes a view
    /// outside [`Effects`] (focus, a notification status change).
    pub fn snapshot(&mut self, now_ms: u64) -> (u64, TimerView) {
        self.view_seq += 1;
        (self.view_seq, self.view(now_ms))
    }

    /// The view at `now_ms`. `mode` is derived here and nowhere else.
    pub fn view(&self, now_ms: u64) -> TimerView {
        let engine = self.engine.view(now_ms);
        let mode = match engine.state {
            EngineState::Idle => Mode::Idle,
            EngineState::Paused => Mode::Paused,
            EngineState::Running => Mode::Focus,
        };
        TimerView {
            state: engine.state,
            phase: engine.phase,
            mode,
            remaining_ms: engine.remaining_ms,
            remaining: format_remaining(engine.remaining_ms),
            remaining_label: spoken_remaining(engine.remaining_ms),
            progress: engine.progress,
            session_id: engine.session_id,
            preset: engine.preset,
            finish: engine.planned_end_ms.map(|end| self.clock_text(end)),
            store: self.store_status,
            notifications: self
                .notifications
                .unwrap_or(NotificationStatus::Unavailable),
        }
    }

    /// The wall clock, and while idle the finish the chosen preset would have if started now.
    pub fn clock_tick(&self, now_ms: u64) -> ClockTick {
        let idle_finish = if self.engine.is_idle() {
            self.settings
                .preset
                .spec(&self.settings.custom)
                .ok()
                .map(|spec| self.clock_text(now_ms.saturating_add(spec.focus_ms)))
        } else {
            None
        };
        ClockTick {
            epoch_ms: now_ms,
            clock: self.clock_text(now_ms),
            idle_finish,
        }
    }

    /// The cached settings: defaults while degraded, never `Quick`.
    pub fn settings(&self) -> TimerSettings {
        self.settings.clone()
    }

    /// Validates and writes the three settings in one transaction (with anything owed),
    /// then updates the cache.
    pub fn set_settings(
        &mut self,
        settings: TimerSettings,
        now_ms: u64,
    ) -> Result<(), SettingsError> {
        if settings.preset == Preset::Quick {
            return Err(SettingsError {
                kind: SettingsErrorKind::InvalidSpec,
                message: "the 2-minute start can't be the saved preset".into(),
            });
        }
        if let Err(error) = settings.custom.validate() {
            return Err(SettingsError {
                kind: SettingsErrorKind::InvalidSpec,
                message: error.to_string(),
            });
        }
        if self.store.is_none() {
            return Err(SettingsError {
                kind: SettingsErrorKind::Unavailable,
                message: "settings can't be saved right now".into(),
            });
        }
        self.write_owed(now_ms, |txn| {
            settings::set(txn, KEY_PRESET, &settings.preset)?;
            settings::set(txn, KEY_CUSTOM, &settings.custom)?;
            settings::set(txn, KEY_NOTIFY, &settings.notify_session_end)
        })
        .map_err(|_| SettingsError {
            kind: SettingsErrorKind::Write,
            message: "settings couldn't be saved".into(),
        })?;
        self.settings = settings;
        // The user's choice now wins over the values the launch could not read.
        self.recover_owed.settings = false;
        self.refresh_status();
        Ok(())
    }

    /// Stores the notification status. True when the status the view shows changed, so
    /// the caller emits one `timer-tick`.
    pub fn set_notifications(&mut self, status: NotificationStatus) -> bool {
        let shown = self
            .notifications
            .unwrap_or(NotificationStatus::Unavailable);
        self.notifications = Some(status);
        shown != status
    }

    /// The notification status, `None` until it has been read.
    pub fn notifications(&self) -> Option<NotificationStatus> {
        self.notifications
    }

    /// Writes anything owed (`unsaved` and the current snapshot). Does nothing when nothing
    /// is owed or there is no store.
    pub fn flush(&mut self, now_ms: u64) {
        if self.store.is_some() && (self.snapshot_dirty || !self.unsaved.is_empty()) {
            // A failure is logged, kept in `unsaved`/`snapshot_dirty` and shown in the view.
            let _ = self.write_owed(now_ms, |_| Ok(()));
        }
    }

    /// Advances the engine; on a natural end records it like a stop. True when it ended.
    fn advance(&mut self, now_ms: u64, outcome: &mut Outcome) -> bool {
        match self.engine.advance(now_ms) {
            Some(Milestone::Ended(record)) => {
                self.end(record, now_ms, outcome);
                true
            }
            _ => false,
        }
    }

    fn start(
        &mut self,
        request: &StartRequest,
        now_ms: u64,
        new_id: impl FnOnce() -> SessionId,
        outcome: &mut Outcome,
    ) -> Result<(), TimerError> {
        if !self.engine.is_idle() {
            return Err(TimerError::AlreadyRunning);
        }
        // Only Custom reads a spec: the given one, else the saved one.
        let custom = match (request.preset, request.custom) {
            (Preset::Custom, Some(custom)) => custom,
            _ => self.settings.custom,
        };
        let spec = request.preset.spec(&custom)?;
        self.engine.start(new_id(), request.preset, spec, now_ms)?;
        self.keep_awake = self.begin_keep_awake();
        outcome.request_notifications = matches!(
            self.notifications,
            None | Some(NotificationStatus::NotDetermined)
        );
        self.changed(now_ms, MilestoneKind::Started, outcome);
        Ok(())
    }

    /// A start, pause or resume: write the snapshot and add the milestone.
    fn changed(&mut self, now_ms: u64, kind: MilestoneKind, outcome: &mut Outcome) {
        self.persist(now_ms, None);
        outcome.milestones.push(MilestoneEvent {
            kind,
            end_reason: None,
            session_id: self.engine.view(now_ms).session_id,
        });
    }

    /// A natural end or a stop: write the record, hand out the guard, add the milestone.
    fn end(&mut self, record: SessionRecord, now_ms: u64, outcome: &mut Outcome) {
        outcome.milestones.push(MilestoneEvent {
            kind: MilestoneKind::Ended,
            end_reason: Some(record.end_reason),
            session_id: Some(record.id.clone()),
        });
        outcome.drop_after_unlock = self.keep_awake.take();
        outcome.ended = Some(record.clone());
        self.persist(now_ms, Some(record));
    }

    /// Records what the engine change owes the store, then tries to write it at once.
    fn persist(&mut self, now_ms: u64, finished: Option<SessionRecord>) {
        if self.store.is_none() {
            return;
        }
        self.unsaved.extend(finished);
        self.snapshot_dirty = true;
        // A failure is logged, kept in `unsaved`/`snapshot_dirty` and shown in the view.
        let _ = self.write_owed(now_ms, |_| Ok(()));
    }

    /// One transaction: insert `unsaved`, write the **current** snapshot (put while running
    /// or paused, clear while idle), then `extra`. Clears what was owed only on success.
    fn write_owed(
        &mut self,
        now_ms: u64,
        extra: impl FnOnce(&mut Txn) -> Result<(), StoreError>,
    ) -> Result<(), StoreError> {
        let Some(store) = &self.store else {
            return Err(StoreError::Closed);
        };
        let (unsaved, engine) = (&self.unsaved, &self.engine);
        let row_unread = self.recover_owed.snapshot;
        let written = store.write(now_ms, |txn| {
            // The launch read of the row failed: whatever session it holds predates this
            // run, so it is recorded as ended before the row is replaced.
            let found = if row_unread {
                unread_row(txn, now_ms)?
            } else {
                RowFound::Nothing
            };
            if let RowFound::Ended(record) = &found {
                focus_sessions::insert(txn, record)?;
            }
            for record in unsaved {
                focus_sessions::insert(txn, record)?;
            }
            if engine.is_idle() {
                // An undecodable row is left in place, as at launch.
                if !matches!(found, RowFound::Undecodable) {
                    active_session::clear(txn)?;
                }
            } else {
                active_session::put(txn, engine)?;
            }
            extra(txn)?;
            Ok(found)
        });
        let written = written.map(|found| {
            self.recover_owed.snapshot = false;
            if let RowFound::Ended(record) = found {
                self.pending.push(recovered(&record));
            }
        });
        match &written {
            Ok(()) => {
                self.unsaved.clear();
                self.snapshot_dirty = false;
                self.refresh_status();
            }
            Err(error) => {
                // Logged once per entry into the degraded state, not per retry.
                if self.store_status == StoreStatus::Ok {
                    eprintln!("store: a write failed ({error}); retrying every second");
                }
                self.store_status = StoreStatus::Unavailable;
            }
        }
        written
    }

    fn begin_keep_awake(&self) -> Option<Box<dyn Any + Send>> {
        match self.platform.keep_awake.begin(KEEP_AWAKE_REASON) {
            Ok(guard) => Some(guard),
            Err(error) => {
                eprintln!("keep-awake: could not begin ({error}); the session runs anyway");
                None
            }
        }
    }

    fn clock_text(&self, epoch_ms: u64) -> String {
        let local = &self.platform.local_time;
        format_clock(epoch_ms, local.utc_offset_min(epoch_ms), local.hour_cycle())
    }

    fn effects(
        &mut self,
        now_ms: u64,
        was_idle: bool,
        outcome: Outcome,
        result: Result<(), TimerCommandError>,
    ) -> Effects {
        let (seq, view) = self.snapshot(now_ms);
        let mut milestones = outcome.milestones;
        if self.listening {
            if milestones.is_empty() {
                milestones.append(&mut self.pending);
            } else {
                // A transition dismisses one-shot notices, and Today drops a notice about
                // another session, so a `recovered` it recorded would never be seen.
                self.pending.clear();
            }
        }
        Effects {
            seq,
            result: result.map(|()| view.clone()),
            view,
            was_idle,
            store_changed: false,
            milestones,
            notify_session_end: outcome.ended.is_some() && self.settings.notify_session_end,
            ended: outcome.ended,
            drop_after_unlock: outcome.drop_after_unlock,
            request_notifications: outcome.request_notifications,
        }
    }
}

/// What a write found in an `active_session` row whose launch read failed.
enum RowFound {
    Nothing,
    /// The session it held, recorded as ended: `completed` at its planned end if that has
    /// passed, otherwise `stopped` with its focused time (another session may now be live,
    /// so it cannot be restored).
    Ended(SessionRecord),
    Undecodable,
}

fn unread_row(txn: &Txn, now_ms: u64) -> Result<RowFound, StoreError> {
    let mut session = match active_session::get::<Session>(txn) {
        Ok(Some(session)) => session,
        Ok(None) => return Ok(RowFound::Nothing),
        Err(StoreError::Json(error)) => {
            eprintln!("store: the saved session could not be decoded ({error}); leaving it");
            return Ok(RowFound::Undecodable);
        }
        Err(error) => return Err(error),
    };
    if let Some(Milestone::Ended(record)) = session.advance(now_ms) {
        return Ok(RowFound::Ended(record));
    }
    // An idle snapshot has nothing to record.
    Ok(session
        .stop(now_ms)
        .map_or(RowFound::Nothing, RowFound::Ended))
}

/// The `recovered` milestone for a session that ended while Orasenda was closed.
fn recovered(record: &SessionRecord) -> MilestoneEvent {
    MilestoneEvent {
        kind: MilestoneKind::Recovered,
        end_reason: Some(record.end_reason),
        session_id: Some(record.id.clone()),
    }
}

/// Reads the settings. A value that fails to decode, a saved `Quick` and an out-of-range
/// Custom are logged and replaced by their default in memory, never rewritten. A database
/// error fails the whole read.
fn read_settings(txn: &Txn) -> Result<TimerSettings, StoreError> {
    let defaults = TimerSettings::default();
    let mut preset = read_setting(txn, KEY_PRESET, defaults.preset)?;
    if preset == Preset::Quick {
        eprintln!("settings: {KEY_PRESET} is quick, which is never saved; using the default");
        preset = defaults.preset;
    }
    let mut custom = read_setting(txn, KEY_CUSTOM, defaults.custom)?;
    if custom.validate().is_err() {
        eprintln!("settings: {KEY_CUSTOM} is out of range; using the default");
        custom = defaults.custom;
    }
    Ok(TimerSettings {
        preset,
        custom,
        notify_session_end: read_setting(txn, KEY_NOTIFY, defaults.notify_session_end)?,
    })
}

fn read_setting<T: DeserializeOwned>(txn: &Txn, key: &str, default: T) -> Result<T, StoreError> {
    match settings::get::<T>(txn, key) {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Ok(default),
        Err(StoreError::Json(error)) => {
            eprintln!("settings: {key} could not be decoded ({error}); using the default");
            Ok(default)
        }
        Err(error) => Err(error),
    }
}

/// Locks the service. A poisoned lock is recovered: every write is one transaction, so the
/// service is consistent even after a panic in another holder.
pub fn lock(service: &Mutex<SessionService>) -> MutexGuard<'_, SessionService> {
    service.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The wall clock in epoch milliseconds: the only place the session reads it.
pub(crate) fn now_ms() -> u64 {
    epoch_ms(SystemTime::now())
}

fn new_session_id() -> SessionId {
    SessionId(Uuid::now_v7().to_string())
}

/// Creates `dir` (SQLite does not create parent directories) and opens `orasenda.db` in it.
pub(crate) fn open_store_at(dir: &Path, new_device_id: &str) -> Result<Store, OpenError> {
    std::fs::create_dir_all(dir).map_err(|error| OpenError::Io(error.to_string()))?;
    Store::open(&dir.join(DB_FILE), new_device_id)
}

/// Opens the store, builds the service and starts the launch read of the notification
/// status on its own thread, so `Notifier::status` never blocks the main thread.
pub fn setup(app: &tauri::App) -> Result<(), Box<dyn Error>> {
    let store = match app.path().app_data_dir() {
        Ok(dir) => open_store_at(&dir, &Uuid::new_v4().to_string()),
        Err(error) => Err(OpenError::Io(error.to_string())),
    };
    let platform = crate::platform::current();
    let notifier = Arc::clone(&platform.notifier);
    app.manage(Mutex::new(SessionService::new(store, platform, now_ms())));
    app.manage(notifier);
    app.manage(ViewGate::default());
    let handle = app.handle().clone();
    thread::Builder::new()
        .name("notification-status".into())
        .spawn(move || scheduler::read_launch_status(&handle))?;
    Ok(())
}

/// Runs `action` for a surface: lock, apply, unlock, publish (always, success or error),
/// return. Called on a `spawn_blocking` thread, never on the main thread.
pub fn run_action(app: &tauri::AppHandle, action: Action) -> Result<TimerView, TimerCommandError> {
    run_action_on(app, action)
}

pub(crate) fn run_action_on<H: Host>(
    host: &H,
    action: Action,
) -> Result<TimerView, TimerCommandError> {
    let Some(service) = host.service() else {
        return Err(TimerCommandError {
            kind: TimerCommandErrorKind::Store,
            message: "Orasenda is still starting".into(),
        });
    };
    let effects = lock(service).apply(action, host.now_ms(), new_session_id);
    // Taken first: the action is committed whatever happens while publishing.
    let result = effects.result.clone();
    scheduler::publish_caught(host, effects);
    result
}

/// `timer_state`: advance, publish, return the view and the drained `pending`. Idle before
/// the service exists.
pub(crate) fn run_state<H: Host>(host: &H) -> TimerState {
    let Some(service) = host.service() else {
        return TimerState {
            view: TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable),
            pending: Vec::new(),
        };
    };
    // `pending` is already drained into `state`, so a panic while publishing must not lose it.
    let (state, effects) = lock(service).state(host.now_ms());
    scheduler::publish_caught(host, effects);
    state
}

/// `settings_set`: validate and write under the lock, then publish one `clock-tick` so the
/// idle finish follows the new preset at once. A save that changes the store status (its
/// write fails, or it also writes what was owed) publishes one `timer-tick` first, even while
/// idle, so the standing store line follows `view.store` (#112).
pub(crate) fn run_set_settings<H: Host>(
    host: &H,
    settings: TimerSettings,
) -> Result<(), SettingsError> {
    let Some(service) = host.service() else {
        return Err(SettingsError {
            kind: SettingsErrorKind::Unavailable,
            message: "settings can't be saved right now".into(),
        });
    };
    let now_ms = host.now_ms();
    let (result, changed) = {
        let mut service = lock(service);
        let before = service.store_status;
        let result = service.set_settings(settings, now_ms);
        let changed = (service.store_status != before).then(|| service.snapshot(now_ms));
        (result, changed)
    };
    // The save is committed: a panic while publishing is logged, never turned into a failure.
    let published = panic::catch_unwind(AssertUnwindSafe(|| {
        if let Some((seq, view)) = changed {
            scheduler::publish_view(host, seq, &view);
        }
        if result.is_ok() {
            scheduler::publish_clock(host);
        }
    }));
    if published.is_err() {
        eprintln!("session: publishing a settings save panicked; its result stands");
    }
    result?;
    Ok(())
}

/// `settings_get`: the cached settings under a brief lock; defaults before setup.
pub(crate) fn current_settings<H: Host>(host: &H) -> TimerSettings {
    host.service()
        .map(|service| lock(service).settings())
        .unwrap_or_default()
}

/// The `RunEvent::Exit` flush: a last attempt to write anything owed.
pub(crate) fn flush_on_exit<H: Host>(host: &H) {
    if let Some(service) = host.service() {
        lock(service).flush(host.now_ms());
    }
}

/// Fakes shared by the session and scheduler tests: a recording host, notifier, keep-awake
/// and local time, all writing to one ordered [`Log`].
#[cfg(test)]
pub(crate) mod test_support {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex, PoisonError};

    use orasenda_core::{
        HourCycle, KeepAwake, LocalTime, NotificationStatus, Notifier, PlatformError, Preset,
        SessionId,
    };
    use orasenda_store::Store;

    use super::{Action, Platform, SessionService, Surfaces, ViewGate};
    use crate::ClockTick;
    use crate::ipc::{MilestoneEvent, StartRequest, TimerView};
    use crate::scheduler::Host;

    /// 2026-11-07 00:00:00 UTC.
    pub(crate) const T0: u64 = 1_794_009_600_000;
    pub(crate) const MINUTE: u64 = 60_000;
    pub(crate) const CLASSIC_MS: u64 = 25 * MINUTE;
    /// The fake local time: one hour east of UTC, 12-hour clock.
    pub(crate) const OFFSET_MIN: i32 = 60;
    pub(crate) const CYCLE: HourCycle = HourCycle::H12;

    #[derive(Debug, Clone, PartialEq)]
    pub(crate) enum Event {
        Tick(TimerView),
        Milestone(MilestoneEvent),
        Clock(ClockTick),
        Render(TimerView),
        StatusRead,
        Requested,
        Posted(String, String),
        Begun,
        Released,
    }

    #[derive(Clone, Default)]
    pub(crate) struct Log(Arc<Mutex<Vec<Event>>>);

    impl Log {
        pub(crate) fn push(&self, event: Event) {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(event);
        }

        pub(crate) fn take(&self) -> Vec<Event> {
            std::mem::take(&mut *self.0.lock().unwrap_or_else(PoisonError::into_inner))
        }

        pub(crate) fn count(&self, matches: impl Fn(&Event) -> bool) -> usize {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .iter()
                .filter(|event| matches(event))
                .count()
        }
    }

    pub(crate) struct FakeKeepAwake {
        pub(crate) log: Log,
        pub(crate) fail: bool,
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

    pub(crate) struct FakeLocalTime;

    impl LocalTime for FakeLocalTime {
        fn utc_offset_min(&self, _at_epoch_ms: u64) -> i32 {
            OFFSET_MIN
        }

        fn hour_cycle(&self) -> HourCycle {
            CYCLE
        }
    }

    type Answer = Box<dyn FnOnce(NotificationStatus) + Send>;

    pub(crate) struct FakeNotifier {
        log: Log,
        status: Mutex<NotificationStatus>,
        answers: Mutex<Vec<Answer>>,
    }

    impl FakeNotifier {
        pub(crate) fn set_status(&self, status: NotificationStatus) {
            *self.status.lock().unwrap_or_else(PoisonError::into_inner) = status;
        }

        /// Answers the oldest open request, as the OS would on a Foundation thread.
        pub(crate) fn answer(&self, status: NotificationStatus) {
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
    }

    pub(crate) struct Fakes {
        pub(crate) platform: Platform,
        pub(crate) log: Log,
        pub(crate) notifier: Arc<FakeNotifier>,
    }

    pub(crate) fn fakes(status: NotificationStatus, keep_awake_fails: bool) -> Fakes {
        let log = Log::default();
        let notifier = Arc::new(FakeNotifier {
            log: log.clone(),
            status: Mutex::new(status),
            answers: Mutex::new(Vec::new()),
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
    pub(crate) fn db(service: &SessionService) -> &Store {
        service.store.as_ref().expect("the service has a store")
    }

    pub(crate) fn memory_store() -> Store {
        Store::open_in_memory("device-test").expect("in-memory store opens")
    }

    /// A service on a fresh in-memory store, notification status not determined.
    pub(crate) fn service() -> SessionService {
        SessionService::new(
            Ok(memory_store()),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        )
    }

    pub(crate) fn start(preset: Preset) -> Action {
        Action::Start(StartRequest {
            preset,
            custom: None,
        })
    }

    pub(crate) fn id(text: &str) -> impl FnOnce() -> SessionId + use<> {
        let text = text.to_owned();
        move || SessionId(text)
    }

    pub(crate) struct HostInner {
        pub(crate) service: Mutex<SessionService>,
        pub(crate) surfaces: Surfaces,
        pub(crate) gate: ViewGate,
        pub(crate) notifier: Arc<FakeNotifier>,
        pub(crate) now: AtomicU64,
        pub(crate) log: Log,
    }

    /// A recording [`Host`]: emits and renders go to the log.
    #[derive(Clone)]
    pub(crate) struct TestHost(pub(crate) Arc<HostInner>);

    impl TestHost {
        pub(crate) fn new(status: NotificationStatus) -> TestHost {
            let Fakes {
                platform,
                log,
                notifier,
            } = fakes(status, false);
            TestHost::with(
                SessionService::new(Ok(memory_store()), platform, T0),
                log,
                notifier,
            )
        }

        pub(crate) fn with(
            service: SessionService,
            log: Log,
            notifier: Arc<FakeNotifier>,
        ) -> TestHost {
            TestHost(Arc::new(HostInner {
                service: Mutex::new(service),
                surfaces: Surfaces::default(),
                gate: ViewGate::default(),
                notifier,
                now: AtomicU64::new(T0),
                log,
            }))
        }

        pub(crate) fn set_now(&self, now_ms: u64) {
            self.0.now.store(now_ms, Ordering::SeqCst);
        }

        pub(crate) fn log(&self) -> &Log {
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
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::{RecvTimeoutError, channel};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    use orasenda_core::{
        CustomSpec, EndReason, EngineState, NotificationStatus, Preset, QUICK_START_MS, Session,
        SessionId, SessionRecord, format_clock, format_remaining, spoken_remaining,
    };
    use orasenda_store::{OpenError, Store, StoreError, WriteGate, active_session, focus_sessions};

    use super::test_support::*;
    use super::*;
    use crate::ipc::{MilestoneKind, Mode, SettingsErrorKind, TimerCommandErrorKind};

    const WAIT: Duration = Duration::from_secs(10);
    /// How long a blocked thread is watched to show it has not moved on.
    const STILL_BLOCKED: Duration = Duration::from_millis(300);

    fn milestone(kind: MilestoneKind, reason: Option<EndReason>, id: &str) -> MilestoneEvent {
        MilestoneEvent {
            kind,
            end_reason: reason,
            session_id: Some(SessionId(id.into())),
        }
    }

    fn kind(effects: &Effects) -> Option<TimerCommandErrorKind> {
        effects.result.as_ref().err().map(|error| error.kind)
    }

    fn snapshot(store: &Store) -> Option<Session> {
        store
            .read(active_session::get::<Session>)
            .expect("snapshot reads")
    }

    /// Whether `record`'s row exists: inserting it again fails only when it does. The probe
    /// always rolls back.
    fn has_row(store: &Store, record: &SessionRecord) -> bool {
        let probe: Result<(), StoreError> =
            store.write(T0, |txn| match focus_sessions::insert(txn, record) {
                Ok(()) => Err(StoreError::Json("absent".into())),
                Err(error) => Err(error),
            });
        match probe {
            Err(StoreError::Json(message)) if message == "absent" => false,
            Err(StoreError::Sqlite(message)) => {
                assert!(
                    message.contains("UNIQUE"),
                    "unexpected probe error: {message}"
                );
                true
            }
            other => panic!("unexpected probe result: {other:?}"),
        }
    }

    fn relaunch(service: &mut SessionService, now_ms: u64) -> SessionService {
        let store = service.store.take().expect("the service has a store");
        SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            now_ms,
        )
    }

    fn ended_record(effects: &Effects) -> SessionRecord {
        effects.ended.clone().expect("a session ended")
    }

    #[test]
    fn start_pause_resume_stop_transitions_and_milestone_order() {
        let mut s = service();
        let started = s.apply(start(Preset::Classic), T0, id("a"));
        assert!(started.was_idle);
        assert_eq!(started.result, Ok(started.view.clone()));
        assert_eq!(started.view.state, EngineState::Running);
        assert_eq!(
            started.milestones,
            [milestone(MilestoneKind::Started, None, "a")]
        );

        let again = s.apply(start(Preset::Classic), T0 + 1, id("b"));
        assert_eq!(kind(&again), Some(TimerCommandErrorKind::AlreadyRunning));
        assert!(again.milestones.is_empty());
        assert_eq!(again.view.session_id, Some(SessionId("a".into())));

        let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
        assert_eq!(paused.view.state, EngineState::Paused);
        assert_eq!(
            paused.milestones,
            [milestone(MilestoneKind::Paused, None, "a")]
        );
        let twice = s.apply(Action::Pause, T0 + MINUTE, id("x"));
        assert_eq!(kind(&twice), Some(TimerCommandErrorKind::WrongState));
        assert_eq!(twice.view.state, EngineState::Paused);

        let resumed = s.apply(Action::Resume, T0 + 2 * MINUTE, id("x"));
        assert_eq!(resumed.view.state, EngineState::Running);
        assert_eq!(
            resumed.milestones,
            [milestone(MilestoneKind::Resumed, None, "a")]
        );
        assert_eq!(
            resumed.view.finish,
            Some(format_clock(T0 + CLASSIC_MS + MINUTE, OFFSET_MIN, CYCLE))
        );
        let resume_running = s.apply(Action::Resume, T0 + 2 * MINUTE, id("x"));
        assert_eq!(
            kind(&resume_running),
            Some(TimerCommandErrorKind::WrongState)
        );

        let stopped = s.apply(Action::Stop, T0 + 3 * MINUTE, id("x"));
        assert_eq!(stopped.result, Ok(stopped.view.clone()));
        assert_eq!(stopped.view.state, EngineState::Idle);
        assert_eq!(
            stopped.milestones,
            [milestone(
                MilestoneKind::Ended,
                Some(EndReason::Stopped),
                "a"
            )]
        );
        let record = ended_record(&stopped);
        assert_eq!(record.end_reason, EndReason::Stopped);
        assert_eq!(record.focused_ms, 2 * MINUTE);
        assert_eq!(record.paused_total_ms, MINUTE);
        assert!(has_row(db(&s), &record));
        assert_eq!(snapshot(db(&s)), None);

        for action in [Action::Stop, Action::Pause, Action::Resume] {
            let idle = s.apply(action, T0 + 4 * MINUTE, id("x"));
            assert_eq!(kind(&idle), Some(TimerCommandErrorKind::NothingRunning));
            assert!(idle.milestones.is_empty());
        }
    }

    #[test]
    fn quick_start_uses_quick_start_ms_and_records_quick() {
        let mut s = service();
        let started = s.apply(start(Preset::Quick), T0, id("q"));
        assert_eq!(started.view.remaining_ms, QUICK_START_MS);
        assert_eq!(started.view.preset, Some(Preset::Quick));
        let ended = s.tick(T0 + QUICK_START_MS);
        let record = ended_record(&ended);
        assert_eq!(record.preset, Preset::Quick);
        assert_eq!(record.planned_ms, QUICK_START_MS);
        assert_eq!(record.end_reason, EndReason::Completed);
        assert!(has_row(db(&s), &record));
    }

    #[test]
    fn custom_start_without_spec_uses_saved_custom() {
        let mut s = service();
        let saved = TimerSettings {
            preset: Preset::Custom,
            custom: CustomSpec {
                focus_min: 30,
                break_min: 5,
            },
            notify_session_end: true,
        };
        s.set_settings(saved, T0).expect("settings save");
        let started = s.apply(start(Preset::Custom), T0, id("c"));
        assert_eq!(started.view.remaining_ms, 30 * MINUTE);
        s.apply(Action::Stop, T0 + 1, id("x"));

        let given = s.apply(
            Action::Start(StartRequest {
                preset: Preset::Custom,
                custom: Some(CustomSpec {
                    focus_min: 20,
                    break_min: 5,
                }),
            }),
            T0 + 2,
            id("d"),
        );
        assert_eq!(given.view.remaining_ms, 20 * MINUTE);
        s.apply(Action::Stop, T0 + 3, id("x"));

        let out_of_range = s.apply(
            Action::Start(StartRequest {
                preset: Preset::Custom,
                custom: Some(CustomSpec {
                    focus_min: 4,
                    break_min: 5,
                }),
            }),
            T0 + 4,
            id("e"),
        );
        assert_eq!(
            kind(&out_of_range),
            Some(TimerCommandErrorKind::InvalidSpec)
        );
        assert_eq!(out_of_range.view.state, EngineState::Idle);
    }

    #[test]
    fn non_custom_start_ignores_given_custom() {
        let given = Some(CustomSpec {
            focus_min: 10,
            break_min: 5,
        });
        for (preset, expected) in [
            (Preset::Classic, CLASSIC_MS),
            (Preset::FiftyTen, 50 * MINUTE),
            (Preset::DeepBlock, 90 * MINUTE),
            (Preset::Quick, QUICK_START_MS),
        ] {
            let mut s = service();
            let started = s.apply(
                Action::Start(StartRequest {
                    preset,
                    custom: given,
                }),
                T0,
                id("a"),
            );
            assert_eq!(started.view.remaining_ms, expected, "{preset:?}");
            assert_eq!(started.view.preset, Some(preset));
        }
    }

    #[test]
    fn view_mode_is_derived_from_engine_state() {
        let mut s = service();
        let idle = s.view(T0);
        assert_eq!((idle.state, idle.mode), (EngineState::Idle, Mode::Idle));
        assert_eq!(idle.remaining, "00:00");
        assert_eq!(idle.remaining_label, "0 seconds");

        s.apply(start(Preset::Classic), T0, id("a"));
        let running = s.view(T0 + 1);
        assert_eq!(
            (running.state, running.mode),
            (EngineState::Running, Mode::Focus)
        );
        assert_eq!(running.remaining_ms, CLASSIC_MS - 1);
        assert_eq!(running.remaining, format_remaining(CLASSIC_MS - 1));
        assert_eq!(running.remaining_label, spoken_remaining(CLASSIC_MS - 1));
        assert_eq!(running.remaining, "25:00");

        s.apply(Action::Pause, T0 + MINUTE, id("x"));
        let paused = s.view(T0 + 2 * MINUTE);
        assert_eq!(
            (paused.state, paused.mode),
            (EngineState::Paused, Mode::Paused)
        );
        assert_eq!(paused.remaining, "24:00");
        assert_eq!(paused.remaining_label, "24 minutes");
    }

    #[test]
    fn finish_is_null_while_paused_and_formatted_while_running() {
        let mut s = service();
        assert_eq!(s.view(T0).finish, None);
        s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(
            s.view(T0).finish,
            Some(format_clock(T0 + CLASSIC_MS, OFFSET_MIN, CYCLE))
        );
        assert_eq!(s.view(T0).finish.as_deref(), Some("1:25 AM"));
        s.apply(Action::Pause, T0 + MINUTE, id("x"));
        assert_eq!(s.view(T0 + MINUTE).finish, None);
    }

    #[test]
    fn idle_finish_null_while_running_and_formatted_while_idle() {
        let mut s = service();
        let idle = s.clock_tick(T0);
        assert_eq!(idle.epoch_ms, T0);
        assert_eq!(idle.clock, format_clock(T0, OFFSET_MIN, CYCLE));
        assert_eq!(
            idle.idle_finish,
            Some(format_clock(T0 + CLASSIC_MS, OFFSET_MIN, CYCLE))
        );
        s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(s.clock_tick(T0 + 1).idle_finish, None);
        s.apply(Action::Pause, T0 + 2, id("x"));
        assert_eq!(s.clock_tick(T0 + 3).idle_finish, None);
    }

    #[test]
    fn pause_after_planned_end_completes_at_planned_end_and_returns_nothing_running() {
        let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, false);
        let mut s = SessionService::new(Ok(memory_store()), platform, T0);
        s.apply(start(Preset::Classic), T0, id("a"));
        let late = s.apply(Action::Pause, T0 + CLASSIC_MS + 5_000, id("x"));
        assert_eq!(kind(&late), Some(TimerCommandErrorKind::NothingRunning));
        assert!(!late.was_idle);
        assert_eq!(late.view.state, EngineState::Idle);
        assert_eq!(
            late.milestones,
            [milestone(
                MilestoneKind::Ended,
                Some(EndReason::Completed),
                "a"
            )]
        );
        let record = ended_record(&late);
        assert_eq!(record.ended_ms, T0 + CLASSIC_MS);
        assert_eq!(record.end_reason, EndReason::Completed);
        assert!(late.notify_session_end);
        assert!(late.drop_after_unlock.is_some(), "the guard is handed out");
        assert_eq!(
            log.count(|e| *e == Event::Released),
            0,
            "not dropped inside"
        );
        assert_eq!(log.count(|e| matches!(e, Event::Posted(..))), 0);
        assert!(has_row(db(&s), &record));
        assert_eq!(snapshot(db(&s)), None);
        drop(late);
        assert_eq!(log.count(|e| *e == Event::Released), 1);
    }

    #[test]
    fn stop_after_planned_end_records_completed() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let late = s.apply(Action::Stop, T0 + 2 * CLASSIC_MS, id("x"));
        assert_eq!(kind(&late), Some(TimerCommandErrorKind::NothingRunning));
        let record = ended_record(&late);
        assert_eq!(record.end_reason, EndReason::Completed);
        assert_eq!(record.ended_ms, T0 + CLASSIC_MS);
        assert_eq!(record.focused_ms, CLASSIC_MS);
        assert_eq!(late.view.state, EngineState::Idle);
    }

    #[test]
    fn start_after_planned_end_publishes_ended_then_started() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let late = s.apply(start(Preset::Classic), T0 + CLASSIC_MS, id("b"));
        assert_eq!(late.result, Ok(late.view.clone()));
        assert_eq!(
            late.milestones,
            [
                milestone(MilestoneKind::Ended, Some(EndReason::Completed), "a"),
                milestone(MilestoneKind::Started, None, "b"),
            ]
        );
        assert_eq!(late.view.session_id, Some(SessionId("b".into())));
        assert!(late.drop_after_unlock.is_some());
        assert_eq!(
            snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
            Some(SessionId("b".into()))
        );
    }

    #[test]
    fn state_after_planned_end_completes_and_reports_idle() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let (state, effects) = s.state(T0 + CLASSIC_MS + 1);
        assert_eq!(state.view.state, EngineState::Idle);
        assert!(state.pending.is_empty());
        assert_eq!(effects.result, Ok(effects.view.clone()));
        assert_eq!(
            effects.milestones,
            [milestone(
                MilestoneKind::Ended,
                Some(EndReason::Completed),
                "a"
            )]
        );
        assert!(has_row(db(&s), &ended_record(&effects)));
    }

    #[test]
    fn recovers_running_snapshot_in_time() {
        // Wall-clock continuation by design (case a of #121): a relaunch before the planned end keeps running.
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let Fakes { platform, log, .. } = fakes(NotificationStatus::NotDetermined, false);
        let store = s.store.take().expect("store");
        let mut back = SessionService::new(Ok(store), platform, T0 + MINUTE);
        let view = back.view(T0 + MINUTE);
        assert_eq!(view.state, EngineState::Running);
        assert_eq!(view.session_id, Some(SessionId("a".into())));
        assert_eq!(view.remaining_ms, CLASSIC_MS - MINUTE);
        assert_eq!(log.count(|e| *e == Event::Begun), 1);
        assert!(back.keep_awake.is_some());
        assert!(back.state(T0 + MINUTE).0.pending.is_empty());
    }

    #[test]
    fn recovers_running_snapshot_past_end_as_completed_with_pending_recovered() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
        assert_eq!(back.view(T0 + 60 * MINUTE).state, EngineState::Idle);
        assert_eq!(back.store_status, StoreStatus::Ok);
        assert_eq!(
            back.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Completed),
                "a"
            )]
        );
        assert!(back.unsaved.is_empty());
        assert!(back.keep_awake.is_none());
        let record = SessionRecord {
            id: SessionId("a".into()),
            preset: Preset::Classic,
            phase: orasenda_core::Phase::Focus,
            planned_ms: CLASSIC_MS,
            started_ms: T0,
            ended_ms: T0 + CLASSIC_MS,
            paused_total_ms: 0,
            focused_ms: CLASSIC_MS,
            end_reason: EndReason::Completed,
            extensions: 0,
        };
        assert!(has_row(db(&back), &record));
        assert_eq!(snapshot(db(&back)), None);
        // A later tick finds nothing owed and writes nothing.
        let effects = back.tick(T0 + 61 * MINUTE);
        assert!(effects.milestones.is_empty());
    }

    #[test]
    fn recovery_with_failing_write_keeps_record_unsaved() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let store = s.store.take().expect("store");
        store.fail_writes(true);
        let mut back = SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0 + 60 * MINUTE,
        );
        assert_eq!(back.unsaved.len(), 1);
        assert_eq!(back.unsaved[0].ended_ms, T0 + CLASSIC_MS);
        assert!(back.snapshot_dirty);
        assert_eq!(back.view(T0).store, StoreStatus::Unavailable);
        assert_eq!(back.pending.len(), 1);

        db(&back).fail_writes(false);
        let effects = back.tick(T0 + 61 * MINUTE);
        assert_eq!(effects.view.store, StoreStatus::Ok);
        assert!(back.unsaved.is_empty());
        assert!(!back.snapshot_dirty);
        assert_eq!(snapshot(db(&back)), None);
    }

    #[test]
    fn recovers_paused_session_as_paused() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        s.apply(Action::Pause, T0 + 10 * MINUTE, id("x"));
        let Fakes { platform, log, .. } = fakes(NotificationStatus::NotDetermined, false);
        let store = s.store.take().expect("store");
        let later = T0 + 5 * 60 * MINUTE;
        let mut back = SessionService::new(Ok(store), platform, later);
        let view = back.view(later);
        assert_eq!(view.state, EngineState::Paused);
        assert_eq!(view.remaining_ms, CLASSIC_MS - 10 * MINUTE);
        assert_eq!(view.finish, None);
        assert!(back.unsaved.is_empty());
        assert!(back.pending.is_empty());
        assert_eq!(log.count(|e| *e == Event::Begun), 1);
        let resumed = back.apply(Action::Resume, later, id("x"));
        assert_eq!(resumed.view.remaining_ms, CLASSIC_MS - 10 * MINUTE);
    }

    #[test]
    fn clock_set_back_after_end_does_not_reopen() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let end = s.tick(T0 + CLASSIC_MS);
        let record = ended_record(&end);
        assert_eq!(record.end_reason, EndReason::Completed);
        assert_eq!(end.view.state, EngineState::Idle);
        assert!(has_row(db(&s), &record));
        assert_eq!(snapshot(db(&s)), None);
        for earlier in [T0 + MINUTE, T0 - MINUTE, T0 + CLASSIC_MS - 1] {
            let t = s.tick(earlier);
            assert!(t.milestones.is_empty());
            assert!(t.ended.is_none());
            assert_eq!(t.view.state, EngineState::Idle);
            assert_eq!(t.view.remaining_ms, 0);
            let p = s.apply(Action::Pause, earlier, id("x"));
            assert_eq!(kind(&p), Some(TimerCommandErrorKind::NothingRunning));
            assert!(p.milestones.is_empty());
            assert!(p.ended.is_none());
            assert_eq!(p.view.state, EngineState::Idle);
            assert_eq!(snapshot(db(&s)), None);
        }
        let mut back = relaunch(&mut s, T0 + MINUTE);
        assert_eq!(back.view(T0 + MINUTE).state, EngineState::Idle);
        assert!(back.state(T0 + MINUTE).0.pending.is_empty());
        assert!(has_row(db(&back), &record));
    }

    #[test]
    fn clock_set_back_after_stop_does_not_reopen_on_relaunch() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let stopped = s.apply(Action::Stop, T0 + 5 * MINUTE, id("x"));
        let record = ended_record(&stopped);
        assert_eq!(record.end_reason, EndReason::Stopped);
        assert!(has_row(db(&s), &record));
        assert_eq!(snapshot(db(&s)), None);
        let mut back = relaunch(&mut s, T0 + MINUTE);
        assert_eq!(back.view(T0 + MINUTE).state, EngineState::Idle);
        assert!(back.state(T0 + MINUTE).0.pending.is_empty());
        assert_eq!(snapshot(db(&back)), None);
    }

    #[test]
    fn undecodable_snapshot_is_logged_and_left_in_place() {
        let store = memory_store();
        store
            .write(T0, |txn| {
                active_session::put(txn, &serde_json::json!({ "state": "bogus" }))
            })
            .expect("garbage written");
        let mut s = SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(s.view(T0).state, EngineState::Idle);
        assert_eq!(s.store_status, StoreStatus::Ok);
        assert!(!s.snapshot_dirty);
        s.tick(T0 + 1_000);
        let raw: Option<serde_json::Value> = db(&s).read(active_session::get).expect("reads");
        assert_eq!(raw, Some(serde_json::json!({ "state": "bogus" })));
    }

    #[test]
    fn undecodable_setting_falls_back_to_default_without_rewrite() {
        let store = memory_store();
        let custom = CustomSpec {
            focus_min: 30,
            break_min: 5,
        };
        store
            .write(T0, |txn| {
                orasenda_store::settings::set(txn, "timer.preset", &"nonsense")?;
                orasenda_store::settings::set(txn, "timer.custom", &custom)?;
                orasenda_store::settings::set(txn, "notify.session_end", &false)
            })
            .expect("settings written");
        let mut s = SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(
            s.settings(),
            TimerSettings {
                preset: Preset::Classic,
                custom,
                notify_session_end: false,
            }
        );
        s.apply(start(Preset::Classic), T0, id("a"));
        let raw: Option<serde_json::Value> = db(&s)
            .read(|txn| orasenda_store::settings::get(txn, "timer.preset"))
            .expect("reads");
        assert_eq!(raw, Some(serde_json::json!("nonsense")));
    }

    #[test]
    fn timer_state_drains_pending() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
        let (first, effects) = back.state(T0 + 60 * MINUTE);
        assert_eq!(
            first.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Completed),
                "a"
            )]
        );
        assert!(effects.milestones.is_empty(), "recovered is never emitted");
        let (second, _) = back.state(T0 + 60 * MINUTE);
        assert!(second.pending.is_empty());
    }

    #[test]
    fn stop_with_failing_write_does_not_resurrect_on_relaunch() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        let stopped = s.apply(Action::Stop, T0 + 10 * MINUTE, id("x"));
        assert_eq!(stopped.result, Ok(stopped.view.clone()));
        assert_eq!(stopped.view.store, StoreStatus::Unavailable);
        let record = ended_record(&stopped);
        assert_eq!(s.unsaved, std::slice::from_ref(&record));
        assert!(s.snapshot_dirty);

        db(&s).fail_writes(false);
        let effects = s.tick(T0 + 10 * MINUTE + 1_000);
        assert_eq!(effects.view.store, StoreStatus::Ok);
        assert!(s.unsaved.is_empty());
        assert!(!s.snapshot_dirty);
        assert!(has_row(db(&s), &record));
        assert_eq!(record.focused_ms, 10 * MINUTE);
        assert_eq!(record.end_reason, EndReason::Stopped);
        assert_eq!(snapshot(db(&s)), None);

        let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
        assert_eq!(back.view(T0 + 60 * MINUTE).state, EngineState::Idle);
        assert!(back.state(T0 + 60 * MINUTE).0.pending.is_empty());
    }

    /// Pins a documented limit (#122, ADR-012): when no write succeeds from
    /// the end through the exit flush, the start snapshot is all the store
    /// has, so a relaunch before the planned end resumes the session. The
    /// store is the single durable medium; nothing is journaled beside it.
    #[test]
    fn end_and_exit_flush_both_failing_leaves_start_snapshot_and_relaunch_resumes() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        assert!(snapshot(db(&s)).is_some());

        db(&s).fail_writes(true);
        let stopped = s.apply(Action::Stop, T0 + 5 * MINUTE, id("x"));
        let record = ended_record(&stopped);
        assert_eq!(stopped.view.store, StoreStatus::Unavailable);
        assert_eq!(stopped.view.state, EngineState::Idle);
        assert_eq!(s.unsaved, std::slice::from_ref(&record));
        assert!(s.snapshot_dirty);
        assert_eq!(record.end_reason, EndReason::Stopped);
        assert_eq!(record.focused_ms, 5 * MINUTE);

        s.flush(T0 + 5 * MINUTE);
        assert_eq!(s.unsaved, std::slice::from_ref(&record));
        assert!(s.snapshot_dirty);
        db(&s).fail_writes(false);
        assert!(!has_row(db(&s), &record));
        assert_eq!(
            snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
            Some(SessionId("a".into()))
        );

        let mut back = relaunch(&mut s, T0 + 6 * MINUTE);
        let view = back.view(T0 + 6 * MINUTE);
        assert_eq!(view.state, EngineState::Running);
        assert_eq!(view.session_id, Some(SessionId("a".into())));
        assert_eq!(view.remaining_ms, CLASSIC_MS - 6 * MINUTE);
        assert!(!has_row(db(&back), &record));
        assert!(back.unsaved.is_empty());
        assert!(back.state(T0 + 6 * MINUTE).0.pending.is_empty());

        let ended = back.apply(Action::Stop, T0 + 7 * MINUTE, id("x"));
        let again = ended_record(&ended);
        assert_eq!(ended.view.store, StoreStatus::Ok);
        assert_eq!(again.end_reason, EndReason::Stopped);
        assert_eq!(again.focused_ms, 7 * MINUTE);
        assert_eq!(again.id, SessionId("a".into()));
        assert!(has_row(db(&back), &again));
        assert_eq!(snapshot(db(&back)), None);

        let mut third = relaunch(&mut back, T0 + 8 * MINUTE);
        assert_eq!(third.view(T0 + 8 * MINUTE).state, EngineState::Idle);
        assert!(third.state(T0 + 8 * MINUTE).0.pending.is_empty());
    }

    /// The exit flush with a store that still rejects writes leaves what is
    /// owed untouched and does not panic (#122).
    #[test]
    fn flush_on_exit_with_failing_store_leaves_owed_state() {
        let host = TestHost::new(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        db(&lock(&host.0.service)).fail_writes(true);
        host.set_now(T0 + MINUTE);
        run_action_on(&host, Action::Stop).expect("stops");
        let (unsaved_before, dirty_before) = {
            let service = lock(&host.0.service);
            (service.unsaved.clone(), service.snapshot_dirty)
        };
        flush_on_exit(&host);
        let service = lock(&host.0.service);
        assert_eq!(service.unsaved, unsaved_before);
        assert_eq!(unsaved_before.len(), 1);
        assert_eq!(unsaved_before[0].end_reason, EndReason::Stopped);
        assert_eq!(unsaved_before[0].focused_ms, MINUTE);
        assert_eq!(service.snapshot_dirty, dirty_before);
        assert!(dirty_before);
        assert_eq!(service.view(T0 + MINUTE).store, StoreStatus::Unavailable);
        assert!(snapshot(db(&service)).is_some());
    }

    #[test]
    fn failed_put_then_recover_keeps_live_snapshot() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        let record_a = ended_record(&stopped);
        let started = s.apply(start(Preset::Classic), T0 + 2 * MINUTE, id("b"));
        assert_eq!(started.view.state, EngineState::Running);
        assert_eq!(started.view.store, StoreStatus::Unavailable);

        db(&s).fail_writes(false);
        let effects = s.tick(T0 + 3 * MINUTE);
        assert_eq!(effects.view.store, StoreStatus::Ok);
        assert!(has_row(db(&s), &record_a));
        assert_eq!(
            snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
            Some(SessionId("b".into()))
        );

        let back = relaunch(&mut s, T0 + 4 * MINUTE);
        let view = back.view(T0 + 4 * MINUTE);
        assert_eq!(view.state, EngineState::Running);
        assert_eq!(view.session_id, Some(SessionId("b".into())));
    }

    #[test]
    fn retry_flush_holds_lock_against_concurrent_start() {
        // `snapshot_dirty` with the engine idle: a stop whose write failed.
        let Fakes {
            platform,
            log,
            notifier,
        } = fakes(NotificationStatus::Denied, false);
        let mut s = SessionService::new(Ok(memory_store()), platform, T0);
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        s.apply(Action::Stop, T0 + MINUTE, id("x"));
        assert!(s.snapshot_dirty);
        db(&s).fail_writes(false);
        let (entered_tx, entered) = channel();
        let (release, release_rx) = channel();
        db(&s).gate_writes(Some(WriteGate {
            entered: entered_tx,
            release: release_rx,
        }));
        let host = TestHost::with(s, log, notifier);
        host.set_now(T0 + 2 * MINUTE);

        let flusher = {
            let host = host.clone();
            thread::spawn(move || crate::scheduler::iterate(&host))
        };
        entered
            .recv_timeout(WAIT)
            .expect("the flush is inside its write");
        assert!(
            host.0.service.try_lock().is_err(),
            "the flush holds the lock"
        );

        let (started_tx, started_rx) = channel();
        let starter = {
            let host = host.clone();
            thread::spawn(move || {
                let result = run_action_on(&host, start(Preset::Classic));
                started_tx.send(()).expect("test is listening");
                result
            })
        };
        assert_eq!(
            started_rx.recv_timeout(STILL_BLOCKED),
            Err(RecvTimeoutError::Timeout),
            "the start waits for the lock"
        );
        assert!(host.0.service.try_lock().is_err());

        release.send(()).expect("the flush is parked");
        // The start's own write parks on the gate next.
        entered
            .recv_timeout(WAIT)
            .expect("the start is inside its write");
        release.send(()).expect("the start is parked");
        flusher.join().expect("flusher joins");
        let started = starter
            .join()
            .expect("starter joins")
            .expect("start succeeds");
        assert_eq!(started.state, EngineState::Running);

        let mut service = lock(&host.0.service);
        assert!(!service.snapshot_dirty);
        assert!(service.unsaved.is_empty());
        let stored = snapshot(db(&service)).expect("a snapshot is stored");
        assert_eq!(stored.view(T0).session_id, started.session_id);
        db(&service).gate_writes(None);
        let back = relaunch(&mut service, T0 + 3 * MINUTE);
        assert_eq!(back.view(T0 + 3 * MINUTE).session_id, started.session_id);
    }

    #[test]
    fn store_status_across_failing_write_and_next_success() {
        let mut s = service();
        let started = s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(started.view.store, StoreStatus::Ok);
        db(&s).fail_writes(true);
        let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
        assert_eq!(paused.result, Ok(paused.view.clone()));
        assert_eq!(paused.view.store, StoreStatus::Unavailable);
        assert_eq!(s.tick(T0 + 2 * MINUTE).view.store, StoreStatus::Unavailable);
        db(&s).fail_writes(false);
        let resumed = s.apply(Action::Resume, T0 + 3 * MINUTE, id("x"));
        assert_eq!(resumed.view.store, StoreStatus::Ok);
        assert!(!s.snapshot_dirty);
    }

    #[test]
    fn start_with_failing_put_runs_and_marks_dirty() {
        let mut s = service();
        db(&s).fail_writes(true);
        let started = s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(started.result, Ok(started.view.clone()));
        assert_eq!(started.view.state, EngineState::Running);
        assert_eq!(started.view.store, StoreStatus::Unavailable);
        assert!(s.snapshot_dirty);
        assert_eq!(snapshot(db(&s)), None);
    }

    #[test]
    fn end_write_failure_keeps_record_unsaved_and_next_tick_flushes_it() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        let ended = s.tick(T0 + CLASSIC_MS);
        let record = ended_record(&ended);
        assert_eq!(ended.view.store, StoreStatus::Unavailable);
        assert_eq!(s.unsaved, std::slice::from_ref(&record));
        db(&s).fail_writes(false);
        let next = s.tick(T0 + CLASSIC_MS + 1_000);
        assert!(next.ended.is_none());
        assert_eq!(next.view.store, StoreStatus::Ok);
        assert!(s.unsaved.is_empty());
        assert!(has_row(db(&s), &record));
        assert_eq!(snapshot(db(&s)), None);
    }

    #[test]
    fn settings_set_refuses_quick_and_out_of_range_custom() {
        let mut s = service();
        let valid = TimerSettings {
            preset: Preset::DeepBlock,
            custom: CustomSpec {
                focus_min: 60,
                break_min: 10,
            },
            notify_session_end: false,
        };
        let quick = TimerSettings {
            preset: Preset::Quick,
            ..valid.clone()
        };
        let error = s.set_settings(quick, T0).expect_err("quick is refused");
        assert_eq!(error.kind, SettingsErrorKind::InvalidSpec);
        for (focus_min, break_min) in [(4, 5), (181, 5), (30, 0), (30, 61)] {
            let bad = TimerSettings {
                preset: Preset::Custom,
                custom: CustomSpec {
                    focus_min,
                    break_min,
                },
                notify_session_end: true,
            };
            let error = s.set_settings(bad, T0).expect_err("out of range");
            assert_eq!(error.kind, SettingsErrorKind::InvalidSpec);
        }
        assert_eq!(s.settings(), TimerSettings::default());

        s.set_settings(valid.clone(), T0)
            .expect("valid settings save");
        assert_eq!(s.settings(), valid);
        let back = relaunch(&mut s, T0);
        assert_eq!(back.settings(), valid);
    }

    #[test]
    fn settings_set_write_failure_is_write_and_keeps_the_cache() {
        let mut s = service();
        db(&s).fail_writes(true);
        let changed = TimerSettings {
            preset: Preset::FiftyTen,
            ..TimerSettings::default()
        };
        let error = s.set_settings(changed, T0).expect_err("the write fails");
        assert_eq!(error.kind, SettingsErrorKind::Write);
        assert_eq!(s.settings(), TimerSettings::default());
        assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
    }

    #[test]
    fn settings_set_unavailable_when_degraded() {
        let mut s = SessionService::new(
            Err(OpenError::Io("denied".into())),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
        let error = s
            .set_settings(TimerSettings::default(), T0)
            .expect_err("degraded");
        assert_eq!(error.kind, SettingsErrorKind::Unavailable);

        let newer = SessionService::new(
            Err(OpenError::Newer {
                found: 2,
                supported: 1,
            }),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(newer.view(T0).store, StoreStatus::Newer);
    }

    #[test]
    fn degraded_service_runs_the_engine_in_memory() {
        let mut s = SessionService::new(
            Err(OpenError::Sqlite("corrupt".into())),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        let started = s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(started.view.state, EngineState::Running);
        assert_eq!(started.view.store, StoreStatus::Unavailable);
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        assert_eq!(stopped.view.state, EngineState::Idle);
    }

    #[test]
    fn settings_get_defaults_when_degraded() {
        let s = SessionService::new(
            Err(OpenError::Io("denied".into())),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(s.settings(), TimerSettings::default());

        let store = memory_store();
        store
            .write(T0, |txn| {
                orasenda_store::settings::set(txn, "timer.preset", &Preset::Quick)
            })
            .expect("written");
        let s = SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        );
        assert_eq!(s.settings().preset, Preset::Classic, "never quick");
    }

    #[test]
    fn keep_awake_begun_on_start_and_guard_returned_on_end() {
        let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, false);
        let mut s = SessionService::new(Ok(memory_store()), platform, T0);
        s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(log.count(|e| *e == Event::Begun), 1);
        assert!(s.keep_awake.is_some());
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        assert!(s.keep_awake.is_none());
        assert!(stopped.drop_after_unlock.is_some());
        assert_eq!(log.count(|e| *e == Event::Released), 0);
        drop(stopped);
        assert_eq!(log.count(|e| *e == Event::Released), 1);

        s.apply(start(Preset::Classic), T0 + 2 * MINUTE, id("b"));
        let ended = s.tick(T0 + 2 * MINUTE + CLASSIC_MS);
        assert!(ended.drop_after_unlock.is_some());
        assert!(ended.notify_session_end);
    }

    #[test]
    fn keep_awake_failure_is_logged_and_start_proceeds() {
        let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, true);
        let mut s = SessionService::new(Ok(memory_store()), platform, T0);
        let started = s.apply(start(Preset::Classic), T0, id("a"));
        assert_eq!(started.result, Ok(started.view.clone()));
        assert_eq!(started.view.state, EngineState::Running);
        assert!(s.keep_awake.is_none());
        assert_eq!(log.count(|e| *e == Event::Begun), 0);
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        assert!(stopped.drop_after_unlock.is_none());
    }

    #[test]
    fn start_requests_notifications_only_while_not_determined_or_unread() {
        for (status, expected) in [
            (None, true),
            (Some(NotificationStatus::NotDetermined), true),
            (Some(NotificationStatus::Granted), false),
            (Some(NotificationStatus::Denied), false),
            (Some(NotificationStatus::Unavailable), false),
        ] {
            let mut s = service();
            if let Some(status) = status {
                s.set_notifications(status);
            }
            let started = s.apply(start(Preset::Classic), T0, id("a"));
            assert_eq!(started.request_notifications, expected, "{status:?}");
            let refused = s.apply(start(Preset::Classic), T0, id("b"));
            assert!(!refused.request_notifications);
        }
    }

    #[test]
    fn set_notifications_reports_a_visible_change_only() {
        let mut s = service();
        assert_eq!(s.notifications(), None);
        assert_eq!(s.view(T0).notifications, NotificationStatus::Unavailable);
        assert!(!s.set_notifications(NotificationStatus::Unavailable));
        assert_eq!(s.notifications(), Some(NotificationStatus::Unavailable));
        assert!(s.set_notifications(NotificationStatus::NotDetermined));
        assert!(!s.set_notifications(NotificationStatus::NotDetermined));
        assert!(s.set_notifications(NotificationStatus::Granted));
        assert_eq!(s.view(T0).notifications, NotificationStatus::Granted);
    }

    #[test]
    fn flush_writes_what_is_owed() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        db(&s).fail_writes(false);
        s.flush(T0 + 2 * MINUTE);
        assert!(s.unsaved.is_empty());
        assert!(!s.snapshot_dirty);
        assert!(has_row(db(&s), &ended_record(&stopped)));
    }

    #[test]
    fn run_action_start_makes_a_uuid_v7() {
        let host = TestHost::new(NotificationStatus::Denied);
        let view = run_action_on(&host, start(Preset::Classic)).expect("starts");
        let id = view.session_id.expect("an id").0;
        let uuid = uuid::Uuid::parse_str(&id).expect("a UUID");
        assert_eq!(uuid.get_version_num(), 7);
    }

    #[test]
    fn run_action_publishes_effects_on_error() {
        let host = TestHost::new(NotificationStatus::Granted);
        read_and_clear(&host);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.log().take();
        host.set_now(T0 + CLASSIC_MS + 5_000);
        let error = run_action_on(&host, Action::Pause).expect_err("nothing running");
        assert_eq!(error.kind, TimerCommandErrorKind::NothingRunning);
        let events = host.log().take();
        let idle_ticks: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, Event::Tick(view) if view.state == EngineState::Idle))
            .collect();
        assert_eq!(idle_ticks.len(), 1, "{events:?}");
        let position = |wanted: &dyn Fn(&Event) -> bool| {
            events
                .iter()
                .position(wanted)
                .unwrap_or_else(|| panic!("missing in {events:?}"))
        };
        let tick = position(&|e| matches!(e, Event::Tick(_)));
        let posted = position(&|e| matches!(e, Event::Posted(..)));
        let released = position(&|e| *e == Event::Released);
        let ended =
            position(&|e| matches!(e, Event::Milestone(m) if m.kind == MilestoneKind::Ended));
        assert!(
            tick < posted && posted < released && released < ended,
            "{events:?}"
        );
    }

    /// Runs the launch read so the host's service knows the fake's status, then clears the log.
    fn read_and_clear(host: &TestHost) {
        crate::scheduler::read_launch_status(host);
        host.log().take();
    }

    #[test]
    fn run_state_publishes_and_drains() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let back = relaunch(&mut s, T0 + 60 * MINUTE);
        let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
        let host = TestHost::with(back, log, notifier);
        let state = run_state(&host);
        assert_eq!(state.pending.len(), 1);
        assert!(run_state(&host).pending.is_empty());
        assert_eq!(
            host.log()
                .count(|e| matches!(e, Event::Milestone(m) if m.kind == MilestoneKind::Recovered)),
            0
        );
    }

    fn tick_views(events: &[Event]) -> Vec<TimerView> {
        events
            .iter()
            .filter_map(|e| match e {
                Event::Tick(v) => Some(v.clone()),
                _ => None,
            })
            .collect()
    }

    fn fifty_ten() -> TimerSettings {
        TimerSettings {
            preset: Preset::FiftyTen,
            ..TimerSettings::default()
        }
    }

    #[test]
    fn run_set_settings_write_failure_publishes_one_unavailable_timer_tick() {
        let host = TestHost::new(NotificationStatus::Denied);
        db(&lock(&host.0.service)).fail_writes(true);
        host.log().take();
        let err = run_set_settings(&host, fifty_ten()).expect_err("the write fails");
        assert_eq!(err.kind, SettingsErrorKind::Write);
        let events = host.log().take();
        let ticks = tick_views(&events);
        assert_eq!(ticks.len(), 1, "{events:?}");
        assert_eq!(ticks[0].state, EngineState::Idle);
        assert_eq!(ticks[0].store, StoreStatus::Unavailable);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, Event::Clock(_)))
                .count(),
            0
        );
        assert_eq!(current_settings(&host), TimerSettings::default());
    }

    #[test]
    fn run_set_settings_flushing_what_was_owed_publishes_one_ok_timer_tick() {
        let host = TestHost::new(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        db(&lock(&host.0.service)).fail_writes(true);
        run_action_on(&host, Action::Stop).expect("stops");
        db(&lock(&host.0.service)).fail_writes(false);
        host.log().take();
        run_set_settings(&host, fifty_ten()).expect("saves");
        let events = host.log().take();
        let ticks = tick_views(&events);
        assert_eq!(ticks.len(), 1, "{events:?}");
        assert_eq!(ticks[0].state, EngineState::Idle);
        assert_eq!(ticks[0].store, StoreStatus::Ok);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, Event::Clock(_)))
                .count(),
            1
        );
        assert!(!lock(&host.0.service).snapshot_dirty);
    }

    #[test]
    fn run_set_settings_without_a_store_change_publishes_no_timer_tick() {
        let host = TestHost::new(NotificationStatus::Denied);
        let count = |host: &TestHost| {
            let events = host.log().take();
            (
                tick_views(&events).len(),
                events
                    .iter()
                    .filter(|e| matches!(e, Event::Clock(_)))
                    .count(),
            )
        };
        host.log().take();
        run_set_settings(&host, fifty_ten()).expect("saves");
        assert_eq!(count(&host), (0, 1));

        let quick = TimerSettings {
            preset: Preset::Quick,
            ..TimerSettings::default()
        };
        assert!(run_set_settings(&host, quick).is_err());
        assert_eq!(count(&host), (0, 0));

        db(&lock(&host.0.service)).fail_writes(true);
        assert!(run_set_settings(&host, TimerSettings::default()).is_err());
        assert_eq!(count(&host), (1, 0));
        assert!(run_set_settings(&host, TimerSettings::default()).is_err());
        assert_eq!(count(&host), (0, 0));
    }

    #[test]
    fn run_set_settings_after_a_failed_settings_read_publishes_one_ok_timer_tick() {
        let mut s = service();
        let read = failing_read(&s, read_settings);
        s.load_settings(read);
        assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
        let Fakes {
            platform,
            log,
            notifier,
        } = fakes(NotificationStatus::Denied, false);
        let _ = platform;
        let host = TestHost::with(s, log, notifier);
        host.log().take();
        run_set_settings(&host, fifty_ten()).expect("saves");
        let events = host.log().take();
        let ticks = tick_views(&events);
        assert_eq!(ticks.len(), 1, "{events:?}");
        assert_eq!(ticks[0].store, StoreStatus::Ok);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, Event::Clock(_)))
                .count(),
            1
        );
    }

    #[test]
    fn run_set_settings_publishes_one_clock_tick() {
        let host = TestHost::new(NotificationStatus::Denied);
        let changed = TimerSettings {
            preset: Preset::FiftyTen,
            ..TimerSettings::default()
        };
        run_set_settings(&host, changed.clone()).expect("saves");
        let events = host.log().take();
        let clocks: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                Event::Clock(tick) => Some(tick.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(clocks.len(), 1, "{events:?}");
        assert_eq!(
            clocks[0].idle_finish,
            Some(format_clock(T0 + 50 * MINUTE, OFFSET_MIN, CYCLE))
        );
        assert_eq!(current_settings(&host), changed);

        let refused = run_set_settings(
            &host,
            TimerSettings {
                preset: Preset::Quick,
                ..TimerSettings::default()
            },
        );
        assert!(refused.is_err());
        assert_eq!(host.log().count(|e| matches!(e, Event::Clock(_))), 0);
    }

    #[test]
    fn flush_on_exit_writes_what_is_owed() {
        let host = TestHost::new(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        db(&lock(&host.0.service)).fail_writes(true);
        host.set_now(T0 + MINUTE);
        run_action_on(&host, Action::Stop).expect("stops");
        db(&lock(&host.0.service)).fail_writes(false);
        flush_on_exit(&host);
        let service = lock(&host.0.service);
        assert!(service.unsaved.is_empty());
        assert!(!service.snapshot_dirty);
    }

    #[test]
    fn poisoned_service_lock_is_recovered() {
        let service = Arc::new(Mutex::new(service()));
        let poisoner = {
            let service = Arc::clone(&service);
            thread::spawn(move || {
                let _held = service.lock().expect("not poisoned yet");
                panic!("poison the lock");
            })
        };
        assert!(poisoner.join().is_err());
        assert!(service.is_poisoned());
        assert_eq!(lock(&service).view(T0).state, EngineState::Idle);
    }

    /// A store holding FiftyTen settings and a running session `a` started at `T0`, opened
    /// again with reads failing.
    fn relaunch_with_reads_failing(now_ms: u64) -> SessionService {
        let mut s = service();
        let saved = TimerSettings {
            preset: Preset::FiftyTen,
            ..TimerSettings::default()
        };
        s.set_settings(saved, T0).expect("settings save");
        s.apply(start(Preset::Classic), T0, id("a"));
        let store = s.store.take().expect("store");
        store.fail_reads(true);
        SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            now_ms,
        )
    }

    fn row_a() -> SessionRecord {
        // `has_row` probes by id only.
        SessionRecord {
            id: SessionId("a".into()),
            preset: Preset::Classic,
            phase: orasenda_core::Phase::Focus,
            planned_ms: CLASSIC_MS,
            started_ms: T0,
            ended_ms: T0,
            paused_total_ms: 0,
            focused_ms: 0,
            end_reason: EndReason::Stopped,
            extensions: 0,
        }
    }

    #[test]
    fn launch_with_reads_failing_starts_idle_on_defaults_and_unavailable() {
        let mut s = relaunch_with_reads_failing(T0 + MINUTE);
        let view = s.view(T0 + MINUTE);
        assert_eq!(view.state, EngineState::Idle);
        assert_eq!(view.store, StoreStatus::Unavailable);
        assert_eq!(s.settings(), TimerSettings::default());
        assert!(s.keep_awake.is_none());
        assert!(s.pending.is_empty());
        let still = s.tick(T0 + 2 * MINUTE);
        assert_eq!(still.view.state, EngineState::Idle);
        assert_eq!(still.view.store, StoreStatus::Unavailable);
        db(&s).fail_reads(false);
        assert!(
            snapshot(db(&s)).is_some(),
            "the unread row is left in place"
        );
    }

    /// One launch read with the store failing reads; the next read succeeds.
    fn failing_read<T>(
        s: &SessionService,
        read: impl FnOnce(&Txn) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        db(s).fail_reads(true);
        let result = db(s).read(read);
        db(s).fail_reads(false);
        assert!(result.is_err(), "the hook fails the read");
        result
    }

    /// Each launch read marks the store unavailable on its own: only the settings read
    /// fails here, the snapshot read succeeds.
    #[test]
    fn failed_settings_read_alone_shows_the_store_unavailable() {
        let mut s = service();
        let read = failing_read(&s, read_settings);
        s.load_settings(read);
        assert!(s.recover_owed.settings);
        assert!(!s.recover_owed.snapshot);
        assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
        assert_eq!(
            s.tick(T0 + 1).view.store,
            StoreStatus::Ok,
            "the retried read succeeds"
        );
    }

    /// Only the snapshot read fails here; the settings read succeeded.
    #[test]
    fn failed_snapshot_read_alone_shows_the_store_unavailable() {
        let mut s = service();
        let read = failing_read(&s, active_session::get::<Session>);
        assert!(!s.recover(read, T0));
        assert!(s.recover_owed.snapshot);
        assert!(!s.recover_owed.settings);
        assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
        assert_eq!(
            s.tick(T0 + 1).view.store,
            StoreStatus::Ok,
            "the retried read succeeds"
        );
    }

    #[test]
    fn reads_recover_and_the_next_tick_runs_recovery() {
        let mut s = relaunch_with_reads_failing(T0 + MINUTE);
        db(&s).fail_reads(false);
        let effects = s.tick(T0 + 2 * MINUTE);
        assert_eq!(effects.view.store, StoreStatus::Ok);
        assert_eq!(effects.view.state, EngineState::Running);
        assert_eq!(effects.view.session_id, Some(SessionId("a".into())));
        assert_eq!(effects.view.remaining_ms, CLASSIC_MS - 2 * MINUTE);
        assert!(s.keep_awake.is_some());
        assert_eq!(s.settings().preset, Preset::FiftyTen);

        let mut late = relaunch_with_reads_failing(T0 + MINUTE);
        db(&late).fail_reads(false);
        let effects = late.tick(T0 + 60 * MINUTE);
        assert_eq!(effects.view.store, StoreStatus::Ok);
        assert_eq!(effects.view.state, EngineState::Idle);
        assert_eq!(
            late.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Completed),
                "a"
            )]
        );
        assert!(has_row(db(&late), &row_a()));
        assert_eq!(snapshot(db(&late)), None);
    }

    /// A store with no session and FiftyTen settings, opened again with reads failing:
    /// idle and unavailable.
    fn relaunch_idle_with_reads_failing() -> SessionService {
        let mut s = service();
        s.set_settings(
            TimerSettings {
                preset: Preset::FiftyTen,
                ..TimerSettings::default()
            },
            T0,
        )
        .expect("settings save");
        let store = s.store.take().expect("store");
        store.fail_reads(true);
        SessionService::new(
            Ok(store),
            fakes(NotificationStatus::NotDetermined, false).platform,
            T0,
        )
    }

    /// Item 2 of #104: a retried read that brings the status back to `ok` while idle marks
    /// the store as changed; a tick that changes nothing does not.
    #[test]
    fn idle_read_retry_back_to_ok_flags_the_store_change() {
        let mut s = relaunch_idle_with_reads_failing();
        let failing = s.tick(T0 + 1_000);
        assert_eq!(failing.view.store, StoreStatus::Unavailable);
        assert!(!failing.store_changed);
        db(&s).fail_reads(false);
        let back = s.tick(T0 + 2_000);
        assert!(back.was_idle);
        assert_eq!(back.view.state, EngineState::Idle);
        assert_eq!(back.view.store, StoreStatus::Ok);
        assert!(back.store_changed);
        assert!(!s.tick(T0 + 3_000).store_changed);
    }

    /// Item 3 of #104: the same for an idle flush that succeeds (`snapshot_dirty` after a
    /// failed stop). The stop itself, a command, leaves the flag false.
    #[test]
    fn idle_flush_back_to_ok_flags_the_store_change() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        db(&s).fail_writes(true);
        let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
        assert_eq!(stopped.view.store, StoreStatus::Unavailable);
        assert!(!stopped.store_changed, "commands leave it false");
        assert!(!s.tick(T0 + MINUTE + 1_000).store_changed, "still failing");
        db(&s).fail_writes(false);
        let flushed = s.tick(T0 + MINUTE + 2_000);
        assert!(flushed.was_idle);
        assert_eq!(flushed.view.state, EngineState::Idle);
        assert_eq!(flushed.view.store, StoreStatus::Ok);
        assert!(flushed.store_changed);
    }

    /// A `recovered` event that a retried read creates after the webview has drained
    /// `pending` goes out as a `timer-milestone` on that tick, once: a later `timer_state`
    /// (Today mounting again) does not hand it out a second time.
    #[test]
    fn late_recovered_event_is_emitted_once_the_webview_listens() {
        let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
        let host = TestHost::with(relaunch_with_reads_failing(T0 + 60 * MINUTE), log, notifier);
        host.set_now(T0 + 60 * MINUTE);
        assert!(run_state(&host).pending.is_empty());
        db(&lock(&host.0.service)).fail_reads(false);
        host.log().take();
        host.set_now(T0 + 61 * MINUTE);
        crate::scheduler::iterate(&host);
        let recovered = Event::Milestone(milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a",
        ));
        assert_eq!(host.log().count(|event| *event == recovered), 1);
        assert!(run_state(&host).pending.is_empty(), "not handed out again");
    }

    /// A start that records the unread row after the webview has listened is a transition,
    /// which dismisses one-shot notices anyway: the row is recorded, but its `recovered`
    /// event is neither emitted behind `started` nor kept for a later `timer_state`.
    #[test]
    fn row_recorded_by_a_start_after_the_webview_listens_is_not_announced() {
        let mut s = relaunch_with_reads_failing(T0 + MINUTE);
        let (state, _) = s.state(T0 + MINUTE);
        assert!(state.pending.is_empty());
        let started = s.apply(start(Preset::Classic), T0 + 3 * MINUTE, id("b"));
        assert_eq!(
            started.milestones,
            [milestone(MilestoneKind::Started, None, "b")]
        );
        assert!(s.pending.is_empty());
        db(&s).fail_reads(false);
        assert!(has_row(db(&s), &row_a()), "the row is still recorded");
    }

    #[test]
    fn start_while_row_unread_then_flush_records_the_pre_quit_session() {
        let mut s = relaunch_with_reads_failing(T0 + MINUTE);
        db(&s).fail_writes(true);
        let started = s.apply(start(Preset::Classic), T0 + 3 * MINUTE, id("b"));
        assert_eq!(started.result, Ok(started.view.clone()));
        assert_eq!(started.view.store, StoreStatus::Unavailable);
        db(&s).fail_reads(false);
        db(&s).fail_writes(false);
        let flushed = s.tick(T0 + 4 * MINUTE);
        assert_eq!(flushed.view.store, StoreStatus::Ok);
        assert_eq!(flushed.view.session_id, Some(SessionId("b".into())));
        assert!(has_row(db(&s), &row_a()));
        assert_eq!(
            snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
            Some(SessionId("b".into()))
        );
        assert_eq!(
            s.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Stopped),
                "a"
            )]
        );
        let back = relaunch(&mut s, T0 + 5 * MINUTE);
        assert_eq!(
            back.view(T0 + 5 * MINUTE).session_id,
            Some(SessionId("b".into()))
        );
    }

    #[test]
    fn start_while_row_unread_records_a_finished_pre_quit_session_as_completed() {
        let mut s = relaunch_with_reads_failing(T0 + 60 * MINUTE);
        let started = s.apply(start(Preset::Classic), T0 + 60 * MINUTE, id("b"));
        assert_eq!(started.view.state, EngineState::Running);
        assert_eq!(
            s.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Completed),
                "a"
            )]
        );
        db(&s).fail_reads(false);
        assert!(has_row(db(&s), &row_a()));
        assert_eq!(
            snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
            Some(SessionId("b".into()))
        );
        // Settings are still owed; the next tick reads them and the status returns to ok.
        let next = s.tick(T0 + 61 * MINUTE);
        assert_eq!(next.view.store, StoreStatus::Ok);
        assert_eq!(s.settings().preset, Preset::FiftyTen);
    }

    #[test]
    fn settings_saved_while_unread_win_over_stored_ones() {
        let mut s = relaunch_with_reads_failing(T0 + 60 * MINUTE);
        let chosen = TimerSettings {
            preset: Preset::DeepBlock,
            ..TimerSettings::default()
        };
        s.set_settings(chosen.clone(), T0 + 60 * MINUTE)
            .expect("writes still work");
        db(&s).fail_reads(false);
        s.tick(T0 + 61 * MINUTE);
        assert_eq!(s.settings(), chosen);
        assert_eq!(s.view(T0 + 61 * MINUTE).store, StoreStatus::Ok);
    }

    /// Panics on every render.
    struct PanickingSurface;

    impl NativeSurface for PanickingSurface {
        fn render(&self, _view: &TimerView) {
            panic!("a surface failed");
        }
    }

    fn with_panicking_surface(host: &TestHost) {
        host.0
            .surfaces
            .0
            .lock()
            .expect("surfaces")
            .push(Arc::new(PanickingSurface));
    }

    #[test]
    fn run_action_returns_its_result_when_publish_panics() {
        let host = TestHost::new(NotificationStatus::Denied);
        with_panicking_surface(&host);
        let started = run_action_on(&host, start(Preset::Classic)).expect("the start committed");
        assert_eq!(started.state, EngineState::Running);
        let paused = run_action_on(&host, Action::Pause).expect("the pause committed");
        assert_eq!(paused.state, EngineState::Paused);
    }

    #[test]
    fn run_state_returns_pending_when_publish_panics() {
        let mut s = service();
        s.apply(start(Preset::Classic), T0, id("a"));
        let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
        back.apply(start(Preset::Classic), T0 + 60 * MINUTE, id("b"));
        let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
        let host = TestHost::with(back, log, notifier);
        host.set_now(T0 + 60 * MINUTE);
        with_panicking_surface(&host);
        let state = run_state(&host);
        assert_eq!(state.view.state, EngineState::Running);
        assert_eq!(
            state.pending,
            [milestone(
                MilestoneKind::Recovered,
                Some(EndReason::Completed),
                "a"
            )]
        );
    }

    #[test]
    fn run_set_settings_returns_ok_when_publish_panics() {
        let host = TestHost::new(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        db(&lock(&host.0.service)).fail_writes(true);
        run_action_on(&host, Action::Stop).expect("stops");
        db(&lock(&host.0.service)).fail_writes(false);
        assert_eq!(lock(&host.0.service).store_status, StoreStatus::Unavailable);
        with_panicking_surface(&host);
        run_set_settings(&host, fifty_ten()).expect("the save committed");
        assert_eq!(current_settings(&host), fifty_ten());
        let service = lock(&host.0.service);
        assert_eq!(service.store_status, StoreStatus::Ok);
        assert!(!service.snapshot_dirty);
    }

    #[test]
    fn run_set_settings_returns_its_write_error_when_publish_panics() {
        let host = TestHost::new(NotificationStatus::Denied);
        with_panicking_surface(&host);
        db(&lock(&host.0.service)).fail_writes(true);
        let err = run_set_settings(&host, fifty_ten()).expect_err("the write fails");
        assert_eq!(err.kind, SettingsErrorKind::Write);
        assert_eq!(current_settings(&host), TimerSettings::default());
    }

    #[test]
    fn setup_creates_app_data_dir() {
        let root =
            std::env::temp_dir().join(format!("orasenda-setup-{}-{}", std::process::id(), T0));
        let dir = root.join("Application Support").join("com.veloud.orasenda");
        assert!(!dir.exists());
        let store = open_store_at(&dir, "device-a").expect("a fresh install opens");
        assert_eq!(store.device_id(), "device-a");
        assert!(dir.join("orasenda.db").is_file());
        drop(store);
        std::fs::remove_dir_all(&root).expect("temp dir removed");
    }
}
