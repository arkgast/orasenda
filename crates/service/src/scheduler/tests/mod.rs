//! The scheduler tests, against the recording host.

mod publish;
mod tick;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;

use orasenda_core::{EndReason, EngineState, NotificationStatus};

use super::*;
use crate::api::{MilestoneKind, StoreStatus};
use crate::session::test_support::Event;
use crate::session::test_support::*;
use crate::session::{Action, NativeSurface, lock, run_action_on};

const WAIT: Duration = Duration::from_secs(10);

fn ticks(events: &[Event]) -> Vec<TimerView> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Tick(view) => Some(view.clone()),
            _ => None,
        })
        .collect()
}

fn launched(status: NotificationStatus) -> TestHost {
    let host = TestHost::new(status);
    read_launch_status(&host);
    host.log().take();
    host
}

/// A surface that records renders into the host's log.
struct Recorder(Log);

impl NativeSurface for Recorder {
    fn render(&self, view: &TimerView) {
        self.0.push(Event::Render(view.clone()));
    }
}

fn with_recorder(host: &TestHost) {
    host.0
        .surfaces
        .0
        .lock()
        .expect("surfaces")
        .push(Arc::new(Recorder(host.log().clone())));
}

fn idle_session_id(running: &[Event]) -> Option<orasenda_core::SessionId> {
    ticks(running)[0].session_id.clone()
}

fn renders(events: &[Event]) -> Vec<TimerView> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Render(view) => Some(view.clone()),
            _ => None,
        })
        .collect()
}
