//! The overlay's two answers: *Back to focus* and *Continue*.

use orasenda_core::{BlockAction, Decision, PlatformError, decide};

use super::{OverlayChoice, Spike, SpikeError, SpikePlatform, platform, platform_error};

pub(crate) fn overlay_ready(spike: &Spike) -> Result<(), SpikeError> {
    let platform = platform(spike)?;
    let pending = spike.state().pending_show();
    if let Some(show) = pending {
        platform.show_overlay(show).map_err(platform_error)?;
    }
    Ok(())
}

pub(crate) fn overlay_choice(spike: &Spike, choice: OverlayChoice) -> Result<(), SpikeError> {
    let platform = platform(spike)?;
    match choice {
        OverlayChoice::Return => back_to_focus(spike, platform),
        OverlayChoice::Continue { reason } => continue_to_target(spike, platform, reason),
    }
}

/// Hides or closes the target, closes the overlay, then lands in the previous app if the
/// current rule does not intercept it, otherwise (or when it cannot be activated, e.g. it
/// quit) in Orasenda's main window. Activating an intercepted app (the target itself, when
/// `previous` was recorded before the rule changed) would unhide it and reopen the overlay in a
/// loop (#41).
fn back_to_focus(spike: &Spike, platform: &dyn SpikePlatform) -> Result<(), SpikeError> {
    let (target, previous, action) = {
        let state = spike.state();
        let previous = state.previous().cloned().filter(|previous| {
            decide(
                previous,
                state.rule(),
                spike.own_bundle_id(),
                state.extra_allow(),
            ) == Decision::Allow
        });
        (state.target().cloned(), previous, state.rule().action)
    };
    if let Some(target) = &target
        && let Err(error) = platform.hide_or_close(target.pid, action)
    {
        eprintln!("{}", hide_or_close_failure(&target.name, action, &error));
    }
    let hidden = platform.hide_overlay();
    spike.state().close_overlay();
    hidden.map_err(platform_error)?;

    if let Some(previous) = previous {
        match platform.activate(previous.pid) {
            Ok(()) => return Ok(()),
            Err(error) => eprintln!("spike: could not activate {}: {error}", previous.name),
        }
    }
    platform.show_main().map_err(|error| {
        eprintln!("spike: could not show the main window: {error}");
        platform_error(error)
    })
}

/// The log line for a failed hide or close of `name`. A hide's `Refused` is AppKit's NO,
/// which macOS 27 returns even when the app hides, so it is not reported as a failure.
pub(super) fn hide_or_close_failure(
    name: &str,
    action: BlockAction,
    error: &PlatformError,
) -> String {
    match (action, error) {
        (BlockAction::Hide, PlatformError::Refused) => format!(
            "spike: hide returned NO for {name} (unreliable on macOS 27; see docs/common-issues.md)"
        ),
        _ => format!("spike: could not {action:?} {name}: {error}"),
    }
}

/// Allows the target until another countable app comes to the front, closes the overlay
/// and lands in the target. The reason is logged, never stored.
fn continue_to_target(
    spike: &Spike,
    platform: &dyn SpikePlatform,
    reason: Option<String>,
) -> Result<(), SpikeError> {
    let target = spike.state().allow_target();
    if let Some(target) = &target {
        eprintln!("spike: continue to {}, reason: {reason:?}", target.name);
    }
    let hidden = platform.hide_overlay();
    spike.state().close_overlay();
    hidden.map_err(platform_error)?;
    match target {
        Some(target) => platform.activate(target.pid).map_err(|error| {
            eprintln!("spike: could not activate {}: {error}", target.name);
            platform_error(error)
        }),
        None => Ok(()),
    }
}
