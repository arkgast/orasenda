use super::*;

const SHORT: [&str; 6] = [
    "Stand up and stretch gently.",
    "Look at something far away.",
    "Take a slow sip of water.",
    "Breathe in twice, then out long.",
    "Walk to another room.",
    "Leave your phone where it is.",
];

const LONG: [&str; 7] = [
    "Stand up and stretch gently.",
    "Walk to another room.",
    "Step outside for some daylight.",
    "Sit quietly and let your mind wander.",
    "Close your eyes and rest for a few minutes.",
    "Leave your phone where it is.",
    "Make a warm drink and sip it slowly.",
];

#[test]
fn pick_follows_the_spec_list_and_rotates_per_kind() {
    for (kind, expected) in [(BreakFor::Short, &SHORT[..]), (BreakFor::Long, &LONG[..])] {
        let got: Vec<&str> = (0..expected.len() * 3)
            .map(|n| pick(kind, n).text)
            .collect();
        let want: Vec<&str> = expected.iter().cycle().take(got.len()).copied().collect();
        assert_eq!(got, want);
    }
}

#[test]
fn labelled_line_starts_with_label() {
    let opt = Suggestion {
        text: "Step outside for some daylight.",
        label: Some(SuggestionLabel::Optional),
    };
    assert_eq!(opt.line(), "Optional: step outside for some daylight.");
    let exp = Suggestion {
        text: "Sit quietly and let your mind wander.",
        label: Some(SuggestionLabel::Experimental),
    };
    assert_eq!(
        exp.line(),
        "Experimental: sit quietly and let your mind wander."
    );
    let plain = Suggestion {
        text: "Walk to another room.",
        label: None,
    };
    assert_eq!(plain.line(), "Walk to another room.");
}

#[test]
fn every_line_ends_with_period_no_exclamation() {
    for e in LIST.iter() {
        let line = e.suggestion.line();
        assert!(line.ends_with('.'), "{line}");
        assert!(!line.contains('!'), "{line}");
        assert!(line.chars().count() <= 60, "{line}");
    }
}
