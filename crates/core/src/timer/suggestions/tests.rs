use super::*;

fn all(kind: BreakFor) -> Vec<&'static Suggestion> {
    let first = pick(kind, 0);
    let mut out = vec![first];
    let mut n = 1;
    while !std::ptr::eq(pick(kind, n), first) {
        out.push(pick(kind, n));
        n += 1;
        assert!(n < 100, "pick never wraps");
    }
    out
}

#[test]
fn pick_rotates_per_kind() {
    for kind in [BreakFor::Short, BreakFor::Long] {
        let list = all(kind);
        assert!(!list.is_empty());
        for n in 0..list.len() * 3 {
            assert!(std::ptr::eq(pick(kind, n), list[n % list.len()]));
        }
    }
}

#[test]
fn pick_short_never_returns_long_only() {
    let long_only = ["Step outside for some daylight."];
    for n in 0..40 {
        assert!(!long_only.contains(&pick(BreakFor::Short, n).text));
    }
    let short_only = ["Look at something far away.", "Take a slow sip of water."];
    for n in 0..40 {
        assert!(!short_only.contains(&pick(BreakFor::Long, n).text));
    }
}

#[test]
fn labelled_line_starts_with_label() {
    let opt = Suggestion { text: "Step outside for some daylight.", label: Some(SuggestionLabel::Optional) };
    assert_eq!(opt.line(), "Optional: step outside for some daylight.");
    let exp = Suggestion { text: "Sit quietly and let your mind wander.", label: Some(SuggestionLabel::Experimental) };
    assert_eq!(exp.line(), "Experimental: sit quietly and let your mind wander.");
    let plain = Suggestion { text: "Walk to another room.", label: None };
    assert_eq!(plain.line(), "Walk to another room.");
}

#[test]
fn every_line_ends_with_period_no_exclamation() {
    for kind in [BreakFor::Short, BreakFor::Long] {
        for s in all(kind) {
            let line = s.line();
            assert!(line.ends_with('.'), "{line}");
            assert!(!line.contains('!'), "{line}");
            assert!(s.text.chars().count() <= 60, "{line}");
        }
    }
}
