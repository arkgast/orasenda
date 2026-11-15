use crate::import::dates::absolute;

#[test]
fn absolute_dates_accepted_and_refused() {
    for (text, want) in [
        ("2026-11-20", "2026-11-20"),
        ("2026-11-20T15:00:00", "2026-11-20"),
        ("2026-11-20 15:00", "2026-11-20"),
        ("20 Nov 2026", "2026-11-20"),
        ("Nov 20 2026", "2026-11-20"),
        ("Nov 20, 2026", "2026-11-20"),
        ("5 September 2026", "2026-09-05"),
    ] {
        assert_eq!(absolute(text).as_deref(), Some(want), "{text}");
    }
    for text in [
        "every day",
        "tomorrow",
        "Nov 20",
        "",
        "2026-13-01",
        "31 Feb 2026",
        "20 Nov 26",
        "20 Foo 2026",
        "2026-11-20x",
    ] {
        assert_eq!(absolute(text), None, "{text}");
    }
}
