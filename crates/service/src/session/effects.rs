//! What a call hands the caller to do after the lock is released.

use std::any::Any;

use orasenda_core::{BreakKind, EndReason, Phase, SessionRecord};

use super::*;
use crate::api::{MilestoneEvent, PresetEntry, Settings, Theme, TimerCommandError, TimerView};

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
    /// The one notification this call owes, for its latest state (spec: Notifications).
    pub notice: Option<Notice>,
    /// The keep-awake guard to drop once the lock is released.
    pub drop_after_unlock: Option<Box<dyn Any + Send>>,
    /// The presented settings to emit as `settings-changed`: owed by a recovered launch read
    /// of the settings, and by a notify review run from the retry of that read.
    pub settings_changed: Option<Settings>,
    /// The preset library to emit as `presets-changed` and tell the surfaces: owed by a
    /// recovered load of the library, which comes before `settings_changed`.
    pub presets_changed: Option<Vec<PresetEntry>>,
    /// The cached theme, when a recovered launch read changed it; applied after unlock,
    /// before `settings_changed`.
    pub apply_theme: Option<Theme>,
    /// Orders `view` against every other published view (see [`ViewGate`]).
    pub seq: u64,
    /// The idle cap line or the keep-going offer changed since the last numbered view: the
    /// view is published even while idle (the midnight tick).
    pub idle_changed: bool,
    /// The two-minute warning fired during the call.
    pub warned: bool,
    /// A focus completed and its break began during the call.
    pub break_started: bool,
    /// A `quick` session ran to its end during the call.
    pub quick_completed: bool,
}

/// A notification to post once the lock is released.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Notice {
    pub title: &'static str,
    pub body: &'static str,
    /// The two-minute warning, which also waits for Orasenda to be in the background.
    pub two_minutes: bool,
}

/// What a transition adds to [`Effects`] besides the view and the result.
#[derive(Default)]
pub(super) struct Outcome {
    pub(super) milestones: Vec<MilestoneEvent>,
    pub(super) ended: Option<SessionRecord>,
    pub(super) drop_after_unlock: Option<Box<dyn Any + Send>>,
    pub(super) warned: bool,
    pub(super) break_started: bool,
    pub(super) quick_completed: bool,
    /// A focus ran to its end in an advance, and its break began (not "Take a break").
    pub(super) advanced_break: bool,
}

impl SessionService {
    pub(super) fn effects(
        &mut self,
        now_ms: u64,
        was_idle: bool,
        outcome: Outcome,
        result: Result<(), TimerCommandError>,
    ) -> Effects {
        let (seq, view) = self.snapshot(now_ms);
        let presented = self.settings();
        let settings_changed =
            std::mem::take(&mut self.settings_event_owed).then_some(presented.clone());
        let presets_changed = std::mem::take(&mut self.presets_event_owed).then(|| self.presets());
        let (warned, break_started, quick_completed) = (
            outcome.warned,
            outcome.break_started,
            outcome.quick_completed,
        );
        let notice = notice_for(&outcome, &presented, &view);
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
            notice,
            ended: outcome.ended,
            drop_after_unlock: outcome.drop_after_unlock,
            settings_changed,
            presets_changed,
            apply_theme: self.theme_owed.take(),
            idle_changed: false,
            warned,
            break_started,
            quick_completed,
        }
    }
}

/// The one notification for the latest state of a call: a completed break, a completed
/// `quick`, a focus whose break began by itself, or the two-minute warning, in that order.
/// A stop, a skipped break and "Take a break" are the person's own actions and say nothing.
fn notice_for(outcome: &Outcome, presented: &Settings, view: &TimerView) -> Option<Notice> {
    let end = |title, body| {
        presented.notify_session_end.then_some(Notice {
            title,
            body,
            two_minutes: false,
        })
    };
    if let Some(last) = outcome
        .ended
        .as_ref()
        .filter(|r| r.end_reason == EndReason::Completed)
    {
        return match (last.phase, outcome.quick_completed) {
            (Phase::Break, _) => end("Break over.", "Start focus when you're ready."),
            (_, true) => end("Focus session complete.", "Keep going if you like."),
            _ => None,
        };
    }
    if outcome.advanced_break {
        let body = if view.break_kind == Some(BreakKind::Long) {
            "Time for a long break."
        } else {
            "Time for a break."
        };
        return end("Focus session complete.", body);
    }
    if outcome.warned && presented.notify_two_minutes {
        let body = if view.phase == Phase::Break {
            "Your break ends soon."
        } else {
            "Finish the thought."
        };
        return Some(Notice {
            title: "Two minutes left.",
            body,
            two_minutes: true,
        });
    }
    None
}
