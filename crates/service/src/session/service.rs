//! The service struct, its constructor and its small accessors.

use std::any::Any;
use std::sync::{Arc, Mutex};

use orasenda_core::{KeepAwake, LocalTime, NotificationStatus, Notifier, Session, SessionRecord};
use orasenda_store::{OpenError, Store, active_session};

use super::*;
use crate::ipc::{MilestoneEvent, Settings, StartRequest, StoreStatus, Theme, TimerView};

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

const KEEP_AWAKE_REASON: &str = "Focus session";

/// The live session, the store and the cached settings. Held in managed state as
/// `Mutex<SessionService>`; lock it with [`lock`].
pub struct SessionService {
    pub(super) engine: Session,
    pub(super) store: Option<Store>,
    pub(super) store_status: StoreStatus,
    pub(super) settings: Settings,
    pub(super) unsaved: Vec<SessionRecord>,
    pub(super) snapshot_dirty: bool,
    pub(super) keep_awake: Option<Box<dyn Any + Send>>,
    pub(super) notifications: Option<NotificationStatus>,
    pub(super) pending: Vec<MilestoneEvent>,
    /// True once `timer_state` has drained `pending`: a webview is listening, so a
    /// `recovered` event created later (a retried read, an idle flush) goes out with the next
    /// [`Effects`] as a `timer-milestone` instead of waiting there. One recorded by a
    /// transition is dropped: that transition dismisses one-shot notices anyway.
    pub(super) listening: bool,
    pub(super) platform: Platform,
    pub(super) recover_owed: RecoverOwed,
    /// True while the `notify_review` marker is pending and the review has not run in this
    /// run. The cache then holds the stored value, an absent key reading as `true`.
    pub(super) review_pending: bool,
    /// A recovered launch read of the settings is owed a `settings-changed`.
    pub(super) settings_event_owed: bool,
    /// The cached theme a recovered launch read changed, until `effects()` hands it out.
    pub(super) theme_owed: Option<Theme>,
    /// The number given to the last view handed out (see [`ViewGate`]).
    pub(super) view_seq: u64,
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
            settings: Settings::default(),
            unsaved: Vec::new(),
            snapshot_dirty: false,
            keep_awake: None,
            notifications: None,
            pending: Vec::new(),
            listening: false,
            platform,
            recover_owed: RecoverOwed::default(),
            review_pending: false,
            settings_event_owed: false,
            theme_owed: None,
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

    /// The presented settings: the cache (defaults while degraded, never `Quick`), except that
    /// while a notify review is pending `notify_session_end` is the review's outcome under the
    /// status known now, and `false` while it is not known.
    pub fn settings(&self) -> Settings {
        let mut presented = self.settings.clone();
        if self.review_pending {
            presented.notify_session_end &= self.notifications == Some(NotificationStatus::Granted);
        }
        presented
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

    pub(super) fn begin_keep_awake(&self) -> Option<Box<dyn Any + Send>> {
        match self.platform.keep_awake.begin(KEEP_AWAKE_REASON) {
            Ok(guard) => Some(guard),
            Err(error) => {
                eprintln!("keep-awake: could not begin ({error}); the session runs anyway");
                None
            }
        }
    }
}
