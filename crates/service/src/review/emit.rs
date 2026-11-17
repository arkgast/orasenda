//! `review-changed`: the overview after a review write, an import, local midnight and 04:00.

use crate::api::ReviewView;
use crate::scheduler::Host;
use crate::session::SessionService;

/// Emits `review-changed`. Call it with the service lock released.
pub fn emit_changed<H: Host>(host: &H, view: &ReviewView) {
    host.emit_review_changed(view);
}

/// The view for `review-changed` after a write that already committed. A failed read is
/// logged and gives `None`: the write stands.
pub(crate) fn changed_view(service: &SessionService, now_ms: u64) -> Option<ReviewView> {
    service
        .review_view(now_ms)
        .map_err(|error| eprintln!("review: could not read the overview back ({error:?})"))
        .ok()
}
