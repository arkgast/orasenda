use std::sync::Arc;

use orasenda_core::BlockAction;

use super::super::*;
use super::support::*;
use crate::spike::OverlayShow;

#[test]
fn spike_disabled_without_flag() {
    assert!(!crate::spike::enabled_from(true, None));
    assert!(!crate::spike::enabled_from(true, Some("0")));
    assert!(!crate::spike::enabled_from(false, Some("1")));
    assert!(crate::spike::enabled_from(true, Some("1")));

    let spike = Spike::new(false, OWN);
    assert_eq!(
        status(&spike),
        SpikeStatus {
            enabled: false,
            platform_supported: false
        }
    );
    assert_eq!(running_apps(&spike), Err(SpikeError::Disabled));
    assert_eq!(
        set_rule(&spike, BlockRule::default()),
        Err(SpikeError::Disabled)
    );
    assert_eq!(usage(&spike), Err(SpikeError::Disabled));
    assert_eq!(overlay_ready(&spike), Err(SpikeError::Disabled));
    assert_eq!(
        overlay_choice(&spike, OverlayChoice::Return),
        Err(SpikeError::Disabled)
    );
}

#[test]
fn spike_rule_disabled_without_flag() {
    assert_eq!(rule(&Spike::new(false, OWN)), Err(SpikeError::Disabled));
    assert_eq!(rule(&Spike::new(true, OWN)), Err(SpikeError::Unsupported));
}

#[test]
fn spike_rule_returns_the_set_rule() {
    let (spike, _) = spike_with(Vec::new());
    assert_eq!(rule(&spike), Ok(BlockRule::default()));
    let new = BlockRule {
        targets: ["com.x.a".to_owned()].into(),
        action: BlockAction::Close,
    };
    set_rule(&spike, new.clone()).unwrap();
    assert_eq!(rule(&spike), Ok(new));
}

#[test]
fn disabled_spike_installs_no_platform() {
    let spike = Arc::new(Spike::new(false, OWN));
    let fake = Fake {
        spike: Arc::downgrade(&spike),
        running: Vec::new(),
        failing: Failing::default(),
        calls: Arc::default(),
    };
    assert!(spike.install(Box::new(fake)).is_err());
    assert!(spike.platform().is_none());
}

#[test]
fn disabled_wins_over_unsupported() {
    // Disabled and no platform: Disabled.
    let disabled = Spike::new(false, OWN);
    assert!(disabled.platform().is_none());
    assert_eq!(usage(&disabled), Err(SpikeError::Disabled));
    // Enabled but no platform: Unsupported.
    let unsupported = Spike::new(true, OWN);
    assert_eq!(
        status(&unsupported),
        SpikeStatus {
            enabled: true,
            platform_supported: false
        }
    );
    assert_eq!(running_apps(&unsupported), Err(SpikeError::Unsupported));
    assert_eq!(
        set_rule(&unsupported, BlockRule::default()),
        Err(SpikeError::Unsupported)
    );
    assert_eq!(usage(&unsupported), Err(SpikeError::Unsupported));
    assert_eq!(overlay_ready(&unsupported), Err(SpikeError::Unsupported));
    assert_eq!(
        overlay_choice(&unsupported, OverlayChoice::Return),
        Err(SpikeError::Unsupported)
    );
    // Enabled with a platform: supported.
    let (spike, _) = spike_with(Vec::new());
    assert_eq!(
        status(&spike),
        SpikeStatus {
            enabled: true,
            platform_supported: true
        }
    );
}

#[test]
fn overlay_choice_serializes_tagged() {
    assert_eq!(
        serde_json::to_value(OverlayChoice::Return).unwrap(),
        serde_json::json!({ "kind": "return" })
    );
    assert_eq!(
        serde_json::to_value(OverlayChoice::Continue {
            reason: Some("reply".into())
        })
        .unwrap(),
        serde_json::json!({ "kind": "continue", "reason": "reply" })
    );
    let parsed: OverlayChoice =
        serde_json::from_value(serde_json::json!({ "kind": "continue", "reason": null })).unwrap();
    assert_eq!(parsed, OverlayChoice::Continue { reason: None });
}

#[test]
fn spike_error_serializes_kind_message() {
    assert_eq!(
        serde_json::to_value(SpikeError::Disabled).unwrap(),
        serde_json::json!({ "kind": "disabled", "message": "the spike is disabled" })
    );
    assert_eq!(
        serde_json::to_value(SpikeError::Unsupported).unwrap()["kind"],
        "unsupported"
    );
    assert_eq!(
        serde_json::to_value(SpikeError::Platform(PlatformError::Other("boom".into()))).unwrap(),
        serde_json::json!({ "kind": "platform", "message": "boom" })
    );
}

#[test]
fn overlay_show_serializes_app_name() {
    use tauri_specta::Event;

    assert_eq!(
        serde_json::to_value(OverlayShow {
            app_name: "Mail".into()
        })
        .unwrap(),
        serde_json::json!({ "appName": "Mail" })
    );
    assert_eq!(OverlayShow::NAME, "overlay-show");
    assert_eq!(crate::spike::SpikeUsageChanged::NAME, "spike-usage-changed");
}
