//! The recording host carries `review-changed`.

use orasenda_core::NotificationStatus;

use super::super::test_support::*;
use crate::api::{PriorityView, ReviewPrimary, ReviewView, ShutdownStatus, WeekStatus};
use crate::scheduler::Host;

#[test]
fn fake_host_records_review_changed() {
    let host = TestHost::new(NotificationStatus::Granted);
    let view = ReviewView {
        today: ShutdownStatus {
            day: "2026-11-16".into(),
            day_label: "Monday 16 November".into(),
            done: true,
            line: "Shutdown complete at 17:42.".into(),
        },
        week: WeekStatus {
            week_start: "2026-11-23".into(),
            label: "Planning the week of 23 November".into(),
            planned: true,
            line: "One priority.".into(),
            priorities: vec![PriorityView {
                task_id: "t1".into(),
                title: "Fix sync bug".into(),
                done: false,
                line: "Fix sync bug · Doing".into(),
            }],
        },
        primary: ReviewPrimary::None,
    };
    host.log().take();
    host.emit_review_changed(&view);
    assert_eq!(host.log().take(), vec![Event::ReviewChanged(view)]);
}
