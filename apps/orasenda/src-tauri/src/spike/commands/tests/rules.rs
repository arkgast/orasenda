use super::super::*;
use super::support::*;
use orasenda_core::BlockAction;

#[test]
fn running_apps_sorted_and_filtered() {
    // An own ID that is not on the safety allowlist, so the own-bundle filter is tested.
    let (spike, _) = spike_failing(
        vec![
            app(Some("com.x.zed"), "Zed", 1),
            app(Some("com.x.self"), "Orasenda", 2),
            app(Some("com.apple.FaceTime"), "FaceTime", 3),
            app(Some("com.x.arc"), "arc", 4),
            app(Some("com.apple.mobilephone"), "Phone", 5),
            app(Some("com.x.mail"), "Mail", 6),
            app(None, "tool", 7),
        ],
        Failing::default(),
        "com.x.self",
    );
    spike
        .state()
        .set_extra_allow(vec!["com.apple.mobilephone".into()]);
    let names: Vec<String> = running_apps(&spike)
        .unwrap()
        .into_iter()
        .map(|a| a.name)
        .collect();
    assert_eq!(names, ["arc", "Mail", "Zed"]);
}

#[test]
fn set_rule_replaces_rule_and_usage_is_newest_first() {
    let (spike, _) = spike_with(Vec::new());
    let rule = BlockRule {
        targets: ["com.x.a".to_owned()].into(),
        action: BlockAction::Close,
    };
    set_rule(&spike, rule.clone()).unwrap();
    assert_eq!(spike.state().rule(), &rule);

    for i in 0..25u64 {
        spike
            .state()
            .tracker
            .on_foreground(&app(Some("com.x.a"), &format!("A{i}"), 1), i * 1000);
    }
    let segments = usage(&spike).unwrap();
    assert_eq!(segments.len(), 20);
    assert_eq!(segments[0].name, "A24");
    assert_eq!(segments[19].name, "A5");
}
