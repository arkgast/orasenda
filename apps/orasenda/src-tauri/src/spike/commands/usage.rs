//! Usage segments for the dev panel.

use orasenda_core::UsageSegment;

use super::{Spike, SpikeError, platform};

/// At most this many segments go to the dev panel.
const USAGE_LIMIT: usize = 20;

pub(crate) fn usage(spike: &Spike) -> Result<Vec<UsageSegment>, SpikeError> {
    platform(spike)?;
    let state = spike.state();
    Ok(state
        .tracker
        .segments()
        .iter()
        .rev()
        .take(USAGE_LIMIT)
        .cloned()
        .collect())
}
