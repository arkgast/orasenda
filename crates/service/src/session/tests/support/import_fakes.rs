//! Fake import sources for the host: Reminders and Things with scripted answers that count
//! how often they were asked and read.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use orasenda_core::PlatformError;
use orasenda_core::platform::import::{
    ReminderItem, RemindersSource, SourceAccess, ThingsReadError, ThingsSource,
};

type Slot<T> = Mutex<Option<Arc<T>>>;

/// The sources a [`TestHost`](super::TestHost) offers; none by default (off macOS).
#[derive(Default)]
pub struct ImportFakes {
    reminders: Slot<dyn RemindersSource>,
    things: Slot<dyn ThingsSource>,
}

impl ImportFakes {
    pub fn reminders(&self) -> Option<Arc<dyn RemindersSource>> {
        self.reminders
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn things(&self) -> Option<Arc<dyn ThingsSource>> {
        self.things
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn set_reminders(&self, source: Arc<dyn RemindersSource>) {
        *self
            .reminders
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(source);
    }

    pub fn set_things(&self, source: Arc<dyn ThingsSource>) {
        *self.things.lock().unwrap_or_else(PoisonError::into_inner) = Some(source);
    }
}

/// Reminders with a scripted access, the answer to a request, and a scripted read.
pub struct FakeReminders {
    pub access: Mutex<SourceAccess>,
    pub answer: SourceAccess,
    pub read: Mutex<Result<Vec<ReminderItem>, PlatformError>>,
    pub requests: AtomicUsize,
    pub reads: AtomicUsize,
    pub opened: AtomicUsize,
    pub open_error: Mutex<Option<PlatformError>>,
}

impl FakeReminders {
    pub fn new(access: SourceAccess, items: Vec<ReminderItem>) -> Arc<Self> {
        Arc::new(Self {
            access: Mutex::new(access),
            answer: SourceAccess::Granted,
            read: Mutex::new(Ok(items)),
            requests: AtomicUsize::new(0),
            reads: AtomicUsize::new(0),
            opened: AtomicUsize::new(0),
            open_error: Mutex::new(None),
        })
    }
}

impl RemindersSource for FakeReminders {
    fn access(&self) -> SourceAccess {
        *self.access.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn request(&self) -> SourceAccess {
        self.requests.fetch_add(1, Ordering::SeqCst);
        *self.access.lock().unwrap_or_else(PoisonError::into_inner) = self.answer;
        self.answer
    }

    fn read(&self) -> Result<Vec<ReminderItem>, PlatformError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.read
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn open_settings(&self) -> Result<(), PlatformError> {
        self.opened.fetch_add(1, Ordering::SeqCst);
        match self
            .open_error
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
        {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

/// Things with a scripted installed flag and a scripted read.
pub struct FakeThings {
    pub installed: bool,
    pub read: Result<String, ThingsReadError>,
    pub reads: AtomicUsize,
    pub opened: AtomicUsize,
    pub open_error: Mutex<Option<PlatformError>>,
}

impl FakeThings {
    pub fn new(read: Result<String, ThingsReadError>) -> Arc<Self> {
        Arc::new(Self {
            installed: true,
            read,
            reads: AtomicUsize::new(0),
            opened: AtomicUsize::new(0),
            open_error: Mutex::new(None),
        })
    }
}

impl ThingsSource for FakeThings {
    fn installed(&self) -> bool {
        self.installed
    }

    fn read(&self) -> Result<String, ThingsReadError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.read.clone()
    }

    fn open_settings(&self) -> Result<(), PlatformError> {
        self.opened.fetch_add(1, Ordering::SeqCst);
        match self
            .open_error
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
        {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}
