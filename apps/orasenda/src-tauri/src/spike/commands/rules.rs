//! Status, running apps and the block rule.

use orasenda_core::{AppRef, BlockRule, SAFETY_ALLOWLIST};

use super::{Spike, SpikeError, SpikeStatus, platform};

pub(crate) fn status(spike: &Spike) -> SpikeStatus {
    SpikeStatus {
        enabled: spike.enabled(),
        platform_supported: spike.platform().is_some(),
    }
}

pub(crate) fn running_apps(spike: &Spike) -> Result<Vec<AppRef>, SpikeError> {
    let platform = platform(spike)?;
    let apps = platform.running_apps();
    let extra_allow = spike.state().extra_allow().to_vec();
    Ok(selectable_apps(apps, spike.own_bundle_id(), &extra_allow))
}

/// Apps the dev panel may offer as targets: with a bundle ID (the rule targets bundle IDs;
/// apps without one are never intercepted), not Orasenda, not on the safety allowlist or
/// `extra_allow`, sorted by name (case-insensitive).
fn selectable_apps(apps: Vec<AppRef>, own_bundle_id: &str, extra_allow: &[String]) -> Vec<AppRef> {
    let mut apps: Vec<AppRef> = apps
        .into_iter()
        .filter(|app| {
            app.bundle_id.as_deref().is_some_and(|id| {
                id != own_bundle_id
                    && !SAFETY_ALLOWLIST.contains(&id)
                    && !extra_allow.iter().any(|allowed| allowed == id)
            })
        })
        .collect();
    apps.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    apps
}

pub(crate) fn set_rule(spike: &Spike, rule: BlockRule) -> Result<(), SpikeError> {
    platform(spike)?;
    spike.state().set_rule(rule);
    Ok(())
}

pub(crate) fn rule(spike: &Spike) -> Result<BlockRule, SpikeError> {
    platform(spike)?;
    let rule = spike.state().rule().clone();
    Ok(rule)
}
