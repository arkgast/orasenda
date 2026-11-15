//! Apple Reminders through EventKit.
//!
//! [`MacReminders`] holds no Objective-C object: each call makes its own `EKEventStore`, and
//! [`RemindersSource::read`] makes it only after access is granted. Completions are
//! `RcBlock`s that send over `mpsc`, as `notifier.rs` does.

mod map;

use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_app_kit::NSWorkspace;
use objc2_event_kit::{EKEntityType, EKEventStore, EKReminder};
use objc2_foundation::{NSArray, NSDate, NSError, NSString, NSURL};
use orasenda_core::platform::PlatformError;
use orasenda_core::platform::import::{ReminderItem, RemindersSource, SourceAccess};

pub use map::{access_from, after_request, due_parts, item_id};

/// How long a read waits for EventKit before it is cancelled.
const READ_TIMEOUT: Duration = Duration::from_secs(30);

const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders";

/// Open reminders from Apple Reminders. Use only when [`crate::is_app_bundle`] is `true`
/// (outside a bundle the OS would attribute access to the terminal).
///
/// `request` and `read` block, so never call either on the main thread.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacReminders;

impl RemindersSource for MacReminders {
    fn access(&self) -> SourceAccess {
        // SAFETY: a class method that reads the OS's status and takes no object.
        access_from(unsafe {
            EKEventStore::authorizationStatusForEntityType(EKEntityType::Reminder)
        })
    }

    /// Asks the user and waits with no timeout, since the answer is theirs. Never call it on
    /// the main thread.
    fn request(&self) -> SourceAccess {
        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(move |granted: Bool, error: *mut NSError| {
            // SAFETY: the framework passes null or a valid error that lives for the call.
            let had_error = if let Some(error) = unsafe { error.as_ref() } {
                eprintln!(
                    "platform-macos: reminders access request failed: {}",
                    error.localizedDescription()
                );
                true
            } else {
                false
            };
            let _ = granted;
            // The request waits with no timeout, so the receiver is there; the send error is
            // ignored on purpose.
            let _ = tx.send(had_error);
        });
        // SAFETY: `new` takes no input and returns an owned store.
        let store = unsafe { EKEventStore::new() };
        // SAFETY: the handler is a valid block and lives until EventKit has copied it.
        unsafe {
            store.requestFullAccessToRemindersWithCompletion(&*handler as *const _ as *mut _)
        };
        match rx.recv() {
            // Re-read the OS's own answer: it is the truth, the flag is only a hint.
            Ok(had_error) => after_request(had_error, self.access()),
            Err(_) => SourceAccess::Unavailable,
        }
    }

    /// Open reminders. Waits 30 s, then cancels the fetch and returns `Err`. A nil result is
    /// an `Err`. Never call it on the main thread.
    fn read(&self) -> Result<Vec<ReminderItem>, PlatformError> {
        if self.access() != SourceAccess::Granted {
            return Err(PlatformError::Refused);
        }
        // SAFETY: `new` takes no input and returns an owned store.
        let store = unsafe { EKEventStore::new() };
        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(move |found: *mut NSArray<EKReminder>| {
            // SAFETY: the framework passes null or a valid array that lives for the call.
            let items = unsafe { found.as_ref() }.map(|list| {
                list.iter()
                    .map(|reminder| map_reminder(&reminder))
                    .collect()
            });
            // A late answer after the timeout is not needed: the send error is ignored on
            // purpose.
            let _ = tx.send(items);
        });
        // SAFETY: nil bounds and calendars mean every incomplete reminder.
        let predicate = unsafe {
            store.predicateForIncompleteRemindersWithDueDateStarting_ending_calendars(
                None, None, None,
            )
        };
        // SAFETY: the predicate and the handler are valid for the call; EventKit copies the block.
        let fetch =
            unsafe { store.fetchRemindersMatchingPredicate_completion(&predicate, &handler) };
        match rx.recv_timeout(READ_TIMEOUT) {
            Ok(Some(items)) => Ok(items),
            Ok(None) => Err(PlatformError::Other("reminders returned no list".into())),
            Err(_) => {
                // SAFETY: `fetch` is the value the fetch call returned.
                unsafe { store.cancelFetchRequest(&fetch) };
                Err(PlatformError::Other(
                    "reminders did not answer within 30 s".into(),
                ))
            }
        }
    }

    fn open_settings(&self) -> Result<(), PlatformError> {
        let url = NSURL::URLWithString(&NSString::from_str(SETTINGS_URL))
            .ok_or_else(|| PlatformError::Other("the settings address is not valid".into()))?;
        if NSWorkspace::sharedWorkspace().openURL(&url) {
            Ok(())
        } else {
            Err(PlatformError::Refused)
        }
    }
}

/// One reminder as the core type, read inside the fetch block.
fn map_reminder(reminder: &Retained<EKReminder>) -> ReminderItem {
    // SAFETY: plain property reads on a reminder the framework just handed over.
    unsafe {
        let external = reminder
            .calendarItemExternalIdentifier()
            .map(|s| s.to_string());
        let local = reminder.calendarItemIdentifier().to_string();
        let due = reminder
            .dueDateComponents()
            .and_then(|c| due_parts(c.year(), c.month(), c.day(), c.hour(), c.minute()));
        ReminderItem {
            id: item_id(external.as_deref(), &local),
            title: reminder.title().to_string(),
            notes: reminder.notes().map(|s| s.to_string()).unwrap_or_default(),
            url: reminder
                .URL()
                .and_then(|u| u.absoluteString())
                .map(|s| s.to_string())
                .unwrap_or_default(),
            list: reminder
                .calendar()
                .map(|c| c.title().to_string())
                .unwrap_or_default(),
            priority: u8::try_from(reminder.priority()).unwrap_or(0).min(9),
            due,
            recurring: reminder.hasRecurrenceRules(),
            created_ms: reminder.creationDate().and_then(|d| epoch_ms(&d)),
        }
    }
}

fn epoch_ms(date: &NSDate) -> Option<u64> {
    let secs = date.timeIntervalSince1970();
    (secs >= 0.0).then_some((secs * 1000.0) as u64)
}
