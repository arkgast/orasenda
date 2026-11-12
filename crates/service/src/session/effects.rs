//! What a call hands the caller to do after the lock is released.

use std::any::Any;

use orasenda_core::SessionRecord;

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
    /// Whether the user wants a notification at a completed end.
    pub notify_session_end: bool,
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
}

/// What a transition adds to [`Effects`] besides the view and the result.
#[derive(Default)]
pub(super) struct Outcome {
    pub(super) milestones: Vec<MilestoneEvent>,
    pub(super) ended: Option<SessionRecord>,
    pub(super) drop_after_unlock: Option<Box<dyn Any + Send>>,
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
            notify_session_end: outcome.ended.is_some() && presented.notify_session_end,
            ended: outcome.ended,
            drop_after_unlock: outcome.drop_after_unlock,
            settings_changed,
            presets_changed,
            apply_theme: self.theme_owed.take(),
        }
    }
}
