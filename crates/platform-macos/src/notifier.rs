//! Notification permission and delivery through `UNUserNotificationCenter`.

use std::cell::Cell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_foundation::{NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
    UNNotificationRequest, UNNotificationSettings, UNUserNotificationCenter,
};
use orasenda_core::platform::{NotificationStatus, Notifier, PlatformError};

/// How long [`MacNotifier::status`] and [`MacNotifier::post`] wait for the notification
/// center to answer before giving up.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(3);

/// Numbers the notifications this process posts, so each gets a fresh identifier (a request
/// with an identifier already in use would replace that notification).
static NEXT_NOTIFICATION: AtomicU64 = AtomicU64::new(1);

/// Notifications through `UNUserNotificationCenter.currentNotificationCenter`.
///
/// Use only when [`crate::is_app_bundle`] is `true`: outside an `.app` bundle the
/// notification center aborts the process. Foundation and UserNotifications only, so no
/// main thread is needed; [`Notifier::status`] and [`Notifier::post`] block, so never call
/// them on the main thread.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacNotifier;

impl Notifier for MacNotifier {
    /// Blocks until the notification center answers, at most 3 s; `Unavailable` when it does
    /// not, or answers with a status this build does not know. `Provisional` and `Ephemeral`
    /// count as `Granted`. Never call it on the main thread.
    fn status(&self) -> NotificationStatus {
        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            // SAFETY: the framework passes valid settings that live for the block call.
            let status = unsafe { settings.as_ref() }.authorizationStatus();
            // The handler may fire after `wait_for_status` gave up and dropped the receiver;
            // that late answer is not needed, so the send error is ignored on purpose.
            let _ = tx.send(notification_status(status));
        });
        center().getNotificationSettingsWithCompletionHandler(&handler);
        wait_for_status(&rx, ANSWER_TIMEOUT)
    }

    /// Asks for alerts and sounds. `done` gets `Granted` or `Denied`, or `Unavailable` when
    /// the request failed, on a thread of the framework's choosing.
    fn request(&self, done: Box<dyn FnOnce(NotificationStatus) + Send>) {
        // The block type is `Fn`, so the `FnOnce` is taken out on the first (and only) call.
        let done = Cell::new(Some(done));
        let handler = RcBlock::new(move |granted: Bool, error: *mut NSError| {
            // SAFETY: the framework passes null or a valid error that lives for the call.
            let status = match unsafe { error.as_ref() } {
                Some(error) => {
                    eprintln!(
                        "platform-macos: notification permission request failed: {}",
                        error.localizedDescription()
                    );
                    NotificationStatus::Unavailable
                }
                None if granted.as_bool() => NotificationStatus::Granted,
                None => NotificationStatus::Denied,
            };
            if let Some(done) = done.take() {
                done(status);
            }
        });
        center().requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
            &handler,
        );
    }

    /// Delivers a notification now. Blocks until the center accepts it, at most 3 s; a
    /// refusal or no answer is `Other`. Never call it on the main thread.
    fn post(&self, title: &str, body: &str) -> Result<(), PlatformError> {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(title));
        content.setBody(&NSString::from_str(body));
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &next_identifier(),
            &content,
            None,
        );
        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(move |error: *mut NSError| {
            // SAFETY: the framework passes null or a valid error that lives for the call.
            let outcome = match unsafe { error.as_ref() } {
                Some(error) => Err(PlatformError::Other(format!(
                    "notification not posted: {}",
                    error.localizedDescription()
                ))),
                None => Ok(()),
            };
            // A late answer after the timeout is not needed: the send error is ignored.
            let _ = tx.send(outcome);
        });
        center().addNotificationRequest_withCompletionHandler(&request, Some(&handler));
        rx.recv_timeout(ANSWER_TIMEOUT).unwrap_or_else(|_| {
            Err(PlatformError::Other(
                "notification center did not answer".into(),
            ))
        })
    }
}

fn center() -> Retained<UNUserNotificationCenter> {
    UNUserNotificationCenter::currentNotificationCenter()
}

/// A process-unique identifier, `orasenda-<pid>-<n>`; the pid keeps a relaunch from reusing
/// the identifiers of notifications still in Notification Center.
fn next_identifier() -> Retained<NSString> {
    let number = NEXT_NOTIFICATION.fetch_add(1, Ordering::Relaxed);
    NSString::from_str(&format!("orasenda-{}-{number}", std::process::id()))
}

fn notification_status(status: UNAuthorizationStatus) -> NotificationStatus {
    match status {
        UNAuthorizationStatus::NotDetermined => NotificationStatus::NotDetermined,
        UNAuthorizationStatus::Denied => NotificationStatus::Denied,
        UNAuthorizationStatus::Authorized
        | UNAuthorizationStatus::Provisional
        | UNAuthorizationStatus::Ephemeral => NotificationStatus::Granted,
        // A kind added by a later macOS: whether it allows posting is unknown.
        UNAuthorizationStatus(raw) => {
            eprintln!("platform-macos: unknown notification authorization status {raw}");
            NotificationStatus::Unavailable
        }
    }
}

/// Waits up to `timeout` for the status a completion handler sends; `Unavailable` when none
/// arrives in time or the sender is gone.
fn wait_for_status(rx: &Receiver<NotificationStatus>, timeout: Duration) -> NotificationStatus {
    rx.recv_timeout(timeout)
        .unwrap_or(NotificationStatus::Unavailable)
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use super::*;

    #[test]
    fn authorization_status_maps_known_values_and_unknown_to_unavailable() {
        let cases = [
            (
                UNAuthorizationStatus::NotDetermined,
                NotificationStatus::NotDetermined,
            ),
            (UNAuthorizationStatus::Denied, NotificationStatus::Denied),
            (
                UNAuthorizationStatus::Authorized,
                NotificationStatus::Granted,
            ),
            (
                UNAuthorizationStatus::Provisional,
                NotificationStatus::Granted,
            ),
            (
                UNAuthorizationStatus::Ephemeral,
                NotificationStatus::Granted,
            ),
            // A value a later macOS might add is not assumed to allow notifications.
            (UNAuthorizationStatus(99), NotificationStatus::Unavailable),
        ];
        for (status, expected) in cases {
            assert_eq!(notification_status(status), expected, "{status:?}");
        }
    }

    #[test]
    fn status_times_out_to_unavailable() {
        // A completion handler that never fires: the sender stays alive and silent.
        let (tx, rx) = mpsc::channel::<NotificationStatus>();
        assert_eq!(
            wait_for_status(&rx, Duration::from_millis(20)),
            NotificationStatus::Unavailable
        );
        drop(tx);
        // The handler (and its sender) was dropped without answering.
        assert_eq!(
            wait_for_status(&rx, Duration::from_millis(20)),
            NotificationStatus::Unavailable
        );
    }
}
