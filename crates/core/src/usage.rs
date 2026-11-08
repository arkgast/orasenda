//! Usage segments built from foreground changes and idle samples. Time is passed in.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::blocking::AppRef;

/// Input-free time after which the open segment is closed.
pub const IDLE_THRESHOLD_MS: u64 = 120_000;

const MAX_SEGMENTS: usize = 500;

/// A stretch of time one app was in front. `end_ms` is `None` while open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageSegment {
    pub bundle_id: Option<String>,
    pub name: String,
    /// UTC epoch milliseconds, far below 2^53, so exact as an `f64` in TypeScript.
    #[specta(type = f64)]
    pub start_ms: u64,
    #[specta(type = f64)]
    pub end_ms: Option<u64>,
}

/// Builds [`UsageSegment`]s; keeps the newest 500.
#[derive(Debug, Clone)]
pub struct UsageTracker {
    idle_threshold_ms: u64,
    segments: Vec<UsageSegment>,
    last_app: Option<(Option<String>, String)>,
    idle: bool,
}

impl UsageTracker {
    pub fn new(idle_threshold_ms: u64) -> UsageTracker {
        UsageTracker {
            idle_threshold_ms,
            segments: Vec::new(),
            last_app: None,
            idle: false,
        }
    }

    pub fn segments(&self) -> &[UsageSegment] {
        &self.segments
    }

    fn close_open(&mut self, at_ms: u64) {
        if let Some(seg) = self.segments.last_mut().filter(|s| s.end_ms.is_none()) {
            seg.end_ms = Some(at_ms.max(seg.start_ms));
        }
    }

    fn open(&mut self, at_ms: u64) {
        let Some((bundle_id, name)) = self.last_app.clone() else {
            return;
        };
        let floor = self
            .segments
            .last()
            .map_or(0, |s| s.end_ms.unwrap_or(s.start_ms));
        self.segments.push(UsageSegment {
            bundle_id,
            name,
            start_ms: at_ms.max(floor),
            end_ms: None,
        });
        if self.segments.len() > MAX_SEGMENTS {
            self.segments.remove(0);
        }
    }

    pub fn on_foreground(&mut self, app: &AppRef, at_ms: u64) {
        self.close_open(at_ms);
        self.last_app = Some((app.bundle_id.clone(), app.name.clone()));
        self.idle = false;
        self.open(at_ms);
    }

    pub fn on_idle_sample(&mut self, idle_ms: u64, at_ms: u64) {
        let input_at = at_ms.saturating_sub(idle_ms);
        if idle_ms >= self.idle_threshold_ms {
            if !self.idle {
                self.close_open(input_at);
                self.idle = true;
            }
        } else if self.idle {
            self.idle = false;
            self.open(input_at);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str) -> AppRef {
        AppRef {
            bundle_id: Some(id.to_owned()),
            name: id.to_owned(),
            pid: 1,
        }
    }

    fn span(t: &UsageTracker, i: usize) -> (u64, Option<u64>) {
        (t.segments()[i].start_ms, t.segments()[i].end_ms)
    }

    #[test]
    fn tracker_switch_closes_and_opens() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        t.on_foreground(&app("a"), 1000);
        t.on_foreground(&app("b"), 5000);
        assert_eq!(t.segments().len(), 2);
        assert_eq!(span(&t, 0), (1000, Some(5000)));
        assert_eq!(span(&t, 1), (5000, None));
        assert_eq!(t.segments()[1].bundle_id.as_deref(), Some("b"));
    }

    #[test]
    fn tracker_idle_closes_at_idle_start() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        t.on_foreground(&app("a"), 1000);
        t.on_idle_sample(130_000, 200_000);
        assert_eq!(span(&t, 0), (1000, Some(70_000)));
    }

    #[test]
    fn tracker_activity_after_idle_reopens() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        t.on_foreground(&app("a"), 1000);
        t.on_idle_sample(130_000, 200_000);
        t.on_idle_sample(135_000, 205_000);
        assert_eq!(t.segments().len(), 1);
        t.on_idle_sample(2_000, 300_000);
        assert_eq!(t.segments().len(), 2);
        assert_eq!(t.segments()[1].bundle_id.as_deref(), Some("a"));
        assert_eq!(span(&t, 1), (298_000, None));
    }

    #[test]
    fn tracker_idle_below_threshold_noop() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        t.on_foreground(&app("a"), 1000);
        t.on_idle_sample(119_999, 200_000);
        assert_eq!(span(&t, 0), (1000, None));
        assert_eq!(t.segments().len(), 1);
    }

    #[test]
    fn tracker_out_of_order_clamped() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        t.on_foreground(&app("a"), 5000);
        t.on_foreground(&app("b"), 4000);
        assert_eq!(span(&t, 0), (5000, Some(5000)));
        assert_eq!(span(&t, 1), (5000, None));
    }

    #[test]
    fn tracker_caps_at_500() {
        let mut t = UsageTracker::new(IDLE_THRESHOLD_MS);
        for i in 0..510u64 {
            t.on_foreground(&app("a"), i * 10);
        }
        assert_eq!(t.segments().len(), 500);
        assert_eq!(t.segments()[0].start_ms, 100);
    }

    #[test]
    fn usage_segment_exports_numbers_as_f64() {
        let mut types = specta::Types::default();
        <UsageSegment as Type>::definition(&mut types);
        let dt = format!("{:?}", types.into_sorted_iter().collect::<Vec<_>>());
        assert!(dt.contains("f64"), "{dt}");
        assert!(!dt.contains("u64"), "{dt}");
    }
}
