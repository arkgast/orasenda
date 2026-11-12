//! Carrying out a session's effects after the service lock is released.

use std::panic::{self, AssertUnwindSafe};
use std::sync::PoisonError;

use orasenda_core::{EngineState, NotificationStatus};

use super::Host;
use crate::api::TimerView;
use crate::session::{Effects, Notice, lock};

/// Carries out `effects` after the service lock is released, in this order: the view and
/// the surfaces, the theme (when a recovered read changed it), `settings-changed` (when owed), the notification, the guard drop, the
/// milestones.
pub fn publish<H: Host>(host: &H, effects: Effects) {
    let Effects {
        view,
        was_idle,
        store_changed,
        milestones,
        notice,
        drop_after_unlock,
        settings_changed,
        presets_changed,
        apply_theme,
        seq,
        idle_changed,
        ..
    } = effects;
    if !was_idle || view.state != EngineState::Idle || store_changed || idle_changed {
        publish_view(host, seq, &view);
    }
    if let Some(theme) = apply_theme {
        host.apply_theme(theme);
    }
    // The library first: the settings that follow may name a preset it just added.
    if let Some(presets) = &presets_changed {
        host.emit_presets_changed(presets);
    }
    if let Some(settings) = &settings_changed {
        host.emit_settings_changed(settings);
    }
    // Read now, not under the lock: the answer is the app's, and it may change any time.
    if let Some(notice) = notice
        && !(notice.two_minutes && host.app_active())
    {
        notify(host, notice);
    }
    drop(drop_after_unlock);
    for milestone in &milestones {
        host.emit_milestone(milestone);
    }
}

/// [`publish`] for a command, whose action is already committed: a panic while publishing
/// (a surface, an emit) is logged instead of turning that result into a failure.
pub fn publish_caught<H: Host>(host: &H, effects: Effects) {
    let published = panic::catch_unwind(AssertUnwindSafe(|| publish(host, effects)));
    if published.is_err() {
        eprintln!("session: publishing a command's effects panicked; its result stands");
    }
}

/// Re-reads the status off-lock (a permission granted later in System Settings counts),
/// publishes a change, then posts when granted.
fn notify<H: Host>(host: &H, notice: Notice) {
    let notifier = host.notifier();
    let status = notifier.status();
    store_status(host, status);
    if status == NotificationStatus::Granted
        && let Err(error) = notifier.post(notice.title, notice.body)
    {
        eprintln!("notifier: could not post a notification: {error}");
    }
}

/// Stores a status read or answer; emits one `timer-tick` when the shown status changed,
/// in every state (plan amendment 4).
///
/// Then runs the pending notify review, which this status may complete (the launch read,
/// the focus re-read, a request's answer, the re-read before posting). After unlock, one
/// `settings-changed` goes out when the review wrote.
pub fn store_status<H: Host>(host: &H, status: NotificationStatus) {
    let Some(service) = host.service() else {
        return;
    };
    let (view, reviewed) = {
        let mut service = lock(service);
        let now_ms = host.now_ms();
        let view = apply_status(&mut service, status, now_ms);
        let reviewed = service
            .run_notify_review(now_ms)
            .then(|| service.settings());
        (view, reviewed)
    };
    if let Some((seq, view)) = view {
        publish_view(host, seq, &view);
    }
    if let Some(settings) = reviewed {
        host.emit_settings_changed(&settings);
    }
}

/// Stores `status` in the locked service; the numbered view to publish when it changed.
pub(super) fn apply_status(
    service: &mut crate::session::SessionService,
    status: NotificationStatus,
    now_ms: u64,
) -> Option<(u64, TimerView)> {
    service
        .set_notifications(status)
        .then(|| service.snapshot(now_ms))
}

/// Emits `timer-tick` and renders the surfaces for `view`, unless a newer view (by `seq`)
/// was already published. The gate is held across the emit and the renders so a stale view
/// can't slip in between a newer one's check and its render. That is safe because neither
/// waits on the main thread: an emit posts to the webview and `Tray::render` only records
/// the view and posts its draw. The notifier, the guard drop and the milestones stay
/// outside the gate.
pub fn publish_view<H: Host>(host: &H, seq: u64, view: &TimerView) {
    let Some(gate) = host.view_gate() else {
        // Only before `session::setup`, when nothing else publishes either.
        host.emit_timer_tick(view);
        render_surfaces(host, view);
        return;
    };
    let mut last = gate.0.lock().unwrap_or_else(PoisonError::into_inner);
    if seq <= *last {
        return;
    }
    *last = seq;
    host.emit_timer_tick(view);
    render_surfaces(host, view);
}

/// Clones the surface list under its lock and renders after releasing it.
fn render_surfaces<H: Host>(host: &H, view: &TimerView) {
    let Some(surfaces) = host.surfaces() else {
        return;
    };
    let list = surfaces
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone();
    for surface in list {
        surface.render(view);
    }
}

/// The launch read of the notification status, on its own thread.
pub fn read_launch_status<H: Host>(host: &H) {
    let status = host.notifier().status();
    store_status(host, status);
}
