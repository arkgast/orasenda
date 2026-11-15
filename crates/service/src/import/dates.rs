//! Absolute dates in source text.

use orasenda_core::LocalDate;

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// `YYYY-MM-DD` (a time part ignored) from text that is one absolute date: `YYYY-MM-DD`, or a
/// day, an English month name and a four-digit year in either order ("20 Nov 2026",
/// "Nov 20 2026"). Anything else ("every day", "tomorrow", "Nov 20") is `None`.
pub(crate) fn absolute(text: &str) -> Option<String> {
    let text = text.trim();
    if let Some(date) = iso(text) {
        return Some(date);
    }
    let tokens: Vec<&str> = text
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|t| !t.is_empty())
        .collect();
    let [a, b, c] = tokens[..] else {
        return None;
    };
    let (day, month, year) = match (month(a), month(b)) {
        (Some(m), None) => (b, m, c),
        (None, Some(m)) => (a, m, c),
        _ => return None,
    };
    if !(1..=2).contains(&day.len()) || year.len() != 4 {
        return None;
    }
    let day: u32 = day.parse().ok()?;
    let year: u32 = year.parse().ok()?;
    iso(&format!("{year:04}-{month:02}-{day:02}"))
}

fn iso(text: &str) -> Option<String> {
    let head = text.get(..10)?;
    let rest = &text[10..];
    if !(rest.is_empty() || is_time(rest)) {
        return None;
    }
    LocalDate::parse_iso(head).map(LocalDate::to_iso)
}

/// `T` or a space, then `HH:MM`, with optional seconds, fraction and zone.
fn is_time(rest: &str) -> bool {
    let Some(time) = rest.strip_prefix(['T', ' ']) else {
        return false;
    };
    let b = time.as_bytes();
    b.len() >= 5
        && b[..2].iter().all(u8::is_ascii_digit)
        && b[2] == b':'
        && b[3..5].iter().all(u8::is_ascii_digit)
        && time[5..]
            .chars()
            .all(|c| c.is_ascii_digit() || ":.+-Z".contains(c))
}

/// 1 to 12 for a full English month name or its three-letter form ("Sept" too).
fn month(word: &str) -> Option<u32> {
    let word = word.trim_end_matches('.').to_lowercase();
    if !word.chars().all(|c| c.is_ascii_alphabetic()) || word.len() < 3 {
        return None;
    }
    let position = MONTHS.iter().position(|m| word.starts_with(m))?;
    let full = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ][position];
    (full.starts_with(&word) || word == "sept").then_some(position as u32 + 1)
}
