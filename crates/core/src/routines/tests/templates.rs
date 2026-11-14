use crate::routines::{TemplateId, Weekdays, templates};

#[test]
fn five_templates_in_order() {
    let ids: Vec<_> = templates::all().iter().map(|t| t.id).collect();
    assert_eq!(
        ids,
        vec![
            TemplateId::MorningLight,
            TemplateId::DeepWorkStart,
            TemplateId::StudySession,
            TemplateId::EveningShutdown,
            TemplateId::WindDown,
        ]
    );
}

#[test]
fn every_template_is_a_named_wellness_suggestion() {
    for t in templates::all() {
        assert!(t.wellness, "{}", t.name);
        assert!(
            t.note
                .starts_with("Wellness suggestion, not medical advice.")
        );
        assert!(!t.steps.is_empty(), "{}", t.name);
        assert!(!t.summary.is_empty());
        for step in t.steps {
            assert!(!step.name.trim().is_empty());
            assert!(step.name.chars().count() <= 80, "{}", step.name);
            assert!(step.identity.is_none(), "identity is the person's own");
            for text in [step.two_minute, step.anchor].into_iter().flatten() {
                assert!(text.chars().count() <= 120);
            }
        }
    }
}

#[test]
fn copy_is_calm() {
    for t in templates::all() {
        let mut texts = vec![t.name, t.summary, t.note];
        for step in t.steps {
            texts.extend([step.name]);
            texts.extend(step.two_minute);
            texts.extend(step.detail);
        }
        for text in texts {
            assert!(!text.contains('!'), "{text}");
            let lower = text.to_lowercase();
            for word in ["missed", "failed", "broken", "streak"] {
                assert!(!lower.contains(word), "{text}");
            }
        }
    }
}

#[test]
fn morning_light_and_movement() {
    let t = templates::get(TemplateId::MorningLight);
    assert_eq!(t.name, "Morning Light & Movement");
    assert_eq!(t.time_of_day, Some(7 * 60));
    assert_eq!(t.days, Weekdays::EVERY_DAY);
    assert_eq!(t.summary, "Water, daylight and movement to start the day.");
    assert_eq!(
        t.note,
        "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence."
    );
    let steps: Vec<_> = t
        .steps
        .iter()
        .map(|s| (s.name, s.two_minute, s.detail, s.optional))
        .collect();
    assert_eq!(
        steps,
        vec![
            ("Drink a glass of water", Some("one sip"), None, false),
            (
                "Get outdoor light: 5–10 min, 15–20 if overcast, 30+ if heavily overcast",
                Some("step outside the door"),
                None,
                false
            ),
            ("Move for 5–10 minutes", Some("ten squats"), None, false),
            (
                "Set the Frog and 3 priorities",
                Some("write the Frog"),
                None,
                false
            ),
            (
                "Delay caffeine 90–120 minutes",
                None,
                Some("The evidence is contested."),
                true
            ),
            ("Electrolytes", None, None, true),
            (
                "Visual focus drill, 30–60 seconds",
                None,
                Some("Weak evidence."),
                true
            ),
        ]
    );
}

#[test]
fn deep_work_start() {
    let t = templates::get(TemplateId::DeepWorkStart);
    assert_eq!(t.name, "Deep Work Start");
    assert_eq!(t.time_of_day, Some(9 * 60));
    assert_eq!(t.days, Weekdays::WEEKDAYS);
    assert_eq!(t.summary, "Clear the way before deep work.");
    let names: Vec<_> = t.steps.iter().map(|s| s.name).collect();
    assert_eq!(
        names,
        vec![
            "Clear the desk",
            "Put the phone in another room",
            "Close chat",
            "Write what this block is for",
            "Turn on your blocker or Do Not Disturb",
        ]
    );
    assert_eq!(t.steps[4].detail, Some("Orasenda's blocking comes later."));
    assert!(t.steps.iter().all(|s| !s.optional));
    assert_eq!(t.note, "Wellness suggestion, not medical advice.");
}

#[test]
fn study_session() {
    let t = templates::get(TemplateId::StudySession);
    assert_eq!(t.name, "Study Session");
    assert_eq!(t.time_of_day, None);
    assert_eq!(t.days, Weekdays::WEEKDAYS);
    assert_eq!(t.summary, "Learn by recalling, not re-reading.");
    let steps: Vec<_> = t
        .steps
        .iter()
        .map(|s| (s.name, s.detail, s.optional))
        .collect();
    assert_eq!(
        steps,
        vec![
            ("Test yourself: recall before you re-read", None, false),
            ("Brief rest between rounds", None, true),
            (
                "NSDR afterwards",
                Some("Non-sleep deep rest. Experimental."),
                true
            ),
        ]
    );
}

#[test]
fn evening_shutdown() {
    let t = templates::get(TemplateId::EveningShutdown);
    assert_eq!(t.name, "Evening Shutdown");
    assert_eq!(t.time_of_day, Some(17 * 60 + 30));
    assert_eq!(t.days, Weekdays::WEEKDAYS);
    assert_eq!(t.summary, "Close the workday on purpose.");
    let names: Vec<_> = t.steps.iter().map(|s| s.name).collect();
    assert_eq!(
        names,
        vec![
            "Move unfinished tasks",
            "Preview tomorrow",
            "Reflect: what went well, what to improve, what was outside your control",
            "Say \"Shutdown complete\"",
        ]
    );
    assert!(t.steps.iter().all(|s| !s.optional));
}

#[test]
fn wind_down() {
    let t = templates::get(TemplateId::WindDown);
    assert_eq!(t.name, "Wind-down");
    assert_eq!(t.time_of_day, Some(21 * 60 + 30));
    assert_eq!(t.days, Weekdays::EVERY_DAY);
    assert_eq!(t.summary, "Dim the evening and set a screen cutoff.");
    let names: Vec<_> = t.steps.iter().map(|s| s.name).collect();
    assert_eq!(
        names,
        vec![
            "Dim the lights and avoid bright overhead light",
            "Set a no-screens cutoff",
        ]
    );
}

#[test]
fn template_ids_round_trip_as_text() {
    for t in templates::all() {
        assert_eq!(TemplateId::parse(t.id.as_str()), Some(t.id));
    }
    assert_eq!(TemplateId::MorningLight.as_str(), "morningLight");
    assert_eq!(TemplateId::WindDown.as_str(), "windDown");
    assert_eq!(TemplateId::parse("morning-light"), None);
    assert_eq!(
        serde_json::to_string(&TemplateId::DeepWorkStart).unwrap(),
        "\"deepWorkStart\""
    );
}

#[test]
fn get_finds_every_template_by_its_id() {
    for t in templates::all() {
        assert_eq!(templates::get(t.id).id, t.id);
    }
}
