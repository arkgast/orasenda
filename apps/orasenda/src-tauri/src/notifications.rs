//! Notification permission and settings for the Settings page (spec B).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use orasenda_core::{NotificationStatus, PlatformError};
use tauri::AppHandle;

use crate::ipc::{NotificationsError, NotificationsErrorKind};
use crate::runtime::session;
use crate::runtime::ticker::{self as scheduler, AppHost, Host};

type Waiter = tauri::async_runtime::Sender<NotificationStatus>;

/// Managed state for the permission flow: the callers waiting on the one prompt in
/// flight, and the single-flight flag of the focus re-read.
#[derive(Clone, Default)]
pub(crate) struct Notifications {
    /// `Some` while a prompt is in flight; every caller that arrives meanwhile joins it.
    waiters: Arc<Mutex<Option<Vec<Waiter>>>>,
    reading: Arc<AtomicBool>,
}

/// The known status; when none is stored, reads it (never under the session lock) and
/// stores it. Never asks.
fn known_or_read<H: Host>(host: &H) -> NotificationStatus {
    let known = host
        .service()
        .and_then(|service| session::lock(service).notifications());
    match known {
        Some(status) => status,
        None => {
            let status = host.notifier().status();
            scheduler::store_status(host, status);
            status
        }
    }
}

/// Asks for the permission, at most once at a time. Reads the status when the launch read
/// is missing; asks the OS only when it is `notDetermined`; every caller that arrives while
/// the prompt is open joins it. The returned receiver gets the final status. Parks no
/// thread and never writes a setting.
fn request_on<H: Host>(
    host: &H,
    state: &Notifications,
) -> tauri::async_runtime::Receiver<NotificationStatus> {
    let (tx, rx) = tauri::async_runtime::channel(1);
    let status = known_or_read(host);
    if status != NotificationStatus::NotDetermined {
        let _ = tx.try_send(status);
        return rx;
    }
    let first = {
        let mut waiters = state.waiters.lock().unwrap_or_else(PoisonError::into_inner);
        match waiters.as_mut() {
            Some(list) => {
                list.push(tx);
                false
            }
            None => {
                *waiters = Some(vec![tx]);
                true
            }
        }
    };
    if first {
        let host = host.clone();
        let waiters = state.waiters.clone();
        host.notifier().request(Box::new({
            let host = host.clone();
            move |answer| {
                scheduler::store_status(&host, answer);
                let list = waiters
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .take()
                    .unwrap_or_default();
                for waiter in list {
                    let _ = waiter.try_send(answer);
                }
            }
        }));
    }
    rx
}

pub(crate) async fn request(app: AppHandle) -> NotificationStatus {
    let state = tauri::Manager::state::<Notifications>(&app).inner().clone();
    let rx = crate::commands::on_blocking(move || request_on(&AppHost::new(&app), &state)).await;
    match rx {
        Some(mut rx) => rx.recv().await.unwrap_or(NotificationStatus::Unavailable),
        None => NotificationStatus::Unavailable,
    }
}

/// Maps a platform failure to the IPC error: `Unsupported` is `unavailable`, anything
/// else (the OS said NO, a bad address) is `failed`.
fn open_settings_error(error: PlatformError) -> NotificationsError {
    match error {
        PlatformError::Unsupported => NotificationsError {
            kind: NotificationsErrorKind::Unavailable,
            message: "notification settings aren't available in this build".into(),
        },
        other => {
            eprintln!("notifications: could not open System Settings: {other}");
            failed()
        }
    }
}

fn failed() -> NotificationsError {
    NotificationsError {
        kind: NotificationsErrorKind::Failed,
        message: "System Settings couldn't be opened".into(),
    }
}

/// Opens the Notifications pane on the main thread, holding no lock.
pub(crate) async fn open_settings(app: AppHandle) -> Result<(), NotificationsError> {
    let notifier = AppHost::new(&app).notifier();
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.try_send(notifier.open_settings());
    })
    .map_err(|_| failed())?;
    match rx.recv().await {
        Some(result) => result.map_err(open_settings_error),
        None => Err(failed()),
    }
}

struct ClearOnDrop(Arc<AtomicBool>);

impl Drop for ClearOnDrop {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Re-reads the status on a `notification-status` thread, one at a time; a trigger while a
/// read runs is dropped. Returns the thread when one was started.
fn reread_on<H: Host>(host: &H, state: &Notifications) -> Option<std::thread::JoinHandle<()>> {
    if state
        .reading
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return None;
    }
    let guard = ClearOnDrop(state.reading.clone());
    let host = host.clone();
    let spawned = std::thread::Builder::new()
        .name("notification-status".into())
        .spawn(move || {
            let _guard = guard;
            let status = host.notifier().status();
            scheduler::store_status(&host, status);
        });
    match spawned {
        Ok(handle) => Some(handle),
        Err(error) => {
            // The closure, and the guard in it, was dropped, which cleared the flag.
            eprintln!("notifications: could not start the status read: {error}");
            None
        }
    }
}

pub(crate) fn on_main_focused(app: &AppHandle) {
    if let Some(state) = tauri::Manager::try_state::<Notifications>(app) {
        reread_on(&AppHost::new(app), state.inner());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::session::lock;
    use crate::runtime::session::test_support::{Event, TestHost};

    fn state() -> Notifications {
        Notifications::default()
    }

    fn drain(
        rx: &mut tauri::async_runtime::Receiver<NotificationStatus>,
    ) -> Option<NotificationStatus> {
        rx.try_recv().ok()
    }

    #[test]
    fn notifications_request_asks_only_when_not_determined() {
        for status in [
            NotificationStatus::Granted,
            NotificationStatus::Denied,
            NotificationStatus::Unavailable,
        ] {
            let host = TestHost::new(status);
            scheduler::store_status(&host, status);
            host.log().take();
            let mut rx = request_on(&host, &state());
            assert_eq!(drain(&mut rx), Some(status));
            assert_eq!(host.log().count(|e| *e == Event::Requested), 0);
        }
        let host = TestHost::new(NotificationStatus::NotDetermined);
        scheduler::store_status(&host, NotificationStatus::NotDetermined);
        host.log().take();
        let mut rx = request_on(&host, &state());
        assert_eq!(drain(&mut rx), None);
        assert_eq!(host.log().count(|e| *e == Event::Requested), 1);
        host.0.notifier.answer(NotificationStatus::Granted);
        assert_eq!(drain(&mut rx), Some(NotificationStatus::Granted));
        // The answer changed the status while idle: exactly one timer-tick carries it.
        assert_eq!(host.log().count(|e| matches!(e, Event::Tick(_))), 1);
    }

    #[test]
    fn notifications_request_reads_status_when_launch_read_missing() {
        let host = TestHost::new(NotificationStatus::Granted);
        host.log().take();
        let mut rx = request_on(&host, &state());
        assert_eq!(drain(&mut rx), Some(NotificationStatus::Granted));
        assert_eq!(host.log().count(|e| *e == Event::StatusRead), 1);
        assert_eq!(host.log().count(|e| *e == Event::Requested), 0);
    }

    #[test]
    fn notifications_request_never_writes_settings() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        let before = crate::runtime::session::test_support::db(&lock(&host.0.service))
            .change_log_ids()
            .len();
        let mut rx = request_on(&host, &state());
        host.0.notifier.answer(NotificationStatus::Denied);
        assert_eq!(drain(&mut rx), Some(NotificationStatus::Denied));
        let after = crate::runtime::session::test_support::db(&lock(&host.0.service))
            .change_log_ids()
            .len();
        assert_eq!(before, after);
    }

    #[test]
    fn notifications_request_joins_prompt_in_flight() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        let s = state();
        let mut a = request_on(&host, &s);
        let mut b = request_on(&host, &s);
        assert_eq!(host.log().count(|e| *e == Event::Requested), 1);
        host.0.notifier.answer(NotificationStatus::Granted);
        assert_eq!(drain(&mut a), Some(NotificationStatus::Granted));
        assert_eq!(drain(&mut b), Some(NotificationStatus::Granted));
    }

    #[test]
    fn focus_rereads_status_single_flight() {
        let host = TestHost::new(NotificationStatus::Granted);
        host.log().take();
        let s = state();
        let gate = host.0.notifier.gate_status();
        let first = reread_on(&host, &s).expect("starts");
        assert!(reread_on(&host, &s).is_none(), "second trigger is dropped");
        gate.send(()).unwrap();
        first.join().unwrap();
        assert_eq!(host.log().count(|e| *e == Event::StatusRead), 1);
        assert_eq!(
            lock(host.service().unwrap()).notifications(),
            Some(NotificationStatus::Granted)
        );
        reread_on(&host, &s).expect("free again").join().unwrap();
    }

    #[test]
    fn focus_reread_flag_clears_after_failed_read() {
        let host = TestHost::new(NotificationStatus::Granted);
        let s = state();
        host.0.notifier.panic_on_status(true);
        assert!(reread_on(&host, &s).unwrap().join().is_err());
        host.0.notifier.panic_on_status(false);
        reread_on(&host, &s).expect("flag cleared").join().unwrap();
    }

    #[test]
    fn review_runs_once_from_any_trigger() {
        let store = crate::runtime::session::test_support::memory_store();
        store.put_meta_for_tests("notify_review", "pending");
        store
            .write(0, |txn| {
                orasenda_store::settings::set(txn, "notify.session_end", &true)
            })
            .expect("seeds");
        let f =
            crate::runtime::session::test_support::fakes(NotificationStatus::NotDetermined, false);
        let service = crate::runtime::session::SessionService::new(Ok(store), f.platform, 0);
        let host = TestHost::with(service, f.log, f.notifier);
        host.log().take();
        let s = state();
        let mut rx = request_on(&host, &s);
        host.0.notifier.answer(NotificationStatus::Granted);
        assert_eq!(drain(&mut rx), Some(NotificationStatus::Granted));
        reread_on(&host, &s).unwrap().join().unwrap();
        let n = host.log().count(|e| matches!(e, Event::SettingsChanged(_)));
        assert_eq!(n, 1);
    }

    #[test]
    fn open_settings_maps_unsupported_to_unavailable() {
        let kind = |e: PlatformError| open_settings_error(e).kind;
        assert!(matches!(
            kind(PlatformError::Unsupported),
            NotificationsErrorKind::Unavailable
        ));
        assert!(matches!(
            kind(PlatformError::Refused),
            NotificationsErrorKind::Failed
        ));
        assert!(matches!(
            kind(PlatformError::Other("x".into())),
            NotificationsErrorKind::Failed
        ));
    }

    #[test]
    fn stored_status_is_returned_without_reading_or_asking() {
        let host = TestHost::new(NotificationStatus::Granted);
        scheduler::store_status(&host, NotificationStatus::Denied);
        host.log().take();
        assert_eq!(known_or_read(&host), NotificationStatus::Denied);
        let events = host.log().take();
        assert!(!events.contains(&Event::StatusRead), "{events:?}");
        assert!(!events.contains(&Event::Requested), "{events:?}");
    }

    #[test]
    fn missing_status_is_read_stored_and_never_requested() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        assert_eq!(known_or_read(&host), NotificationStatus::NotDetermined);
        let events = host.log().take();
        assert_eq!(
            events.iter().filter(|e| **e == Event::StatusRead).count(),
            1,
            "{events:?}"
        );
        assert!(!events.contains(&Event::Requested), "{events:?}");
        assert_eq!(
            crate::runtime::session::lock(host.service().unwrap()).notifications(),
            Some(NotificationStatus::NotDetermined)
        );
    }
}
