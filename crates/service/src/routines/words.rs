//! Every sentence and time the Routines page shows, worded in Rust (ADR-011). Plain and kind:
//! no exclamation marks, and never *missed*, *failed*, *broken* or *streak lost*.

use orasenda_core::routines::TemplateStep;
use orasenda_core::timer::format_clock;
use orasenda_core::{HourCycle, Weekdays};

use crate::api::RoutineToday;

const MINUTE_MS: u64 = 60_000;

/// The fresh-start line, shown after two scheduled days off in a row.
pub const FRESH_START: &str = "Two days off. Today is a fresh start.";

/// Words that already start a *when* ("after breakfast", "at 7:00", "every morning").
const WHEN_WORDS: [&str; 14] = [
    "at", "after", "before", "when", "in", "on", "every", "during", "once", "while", "by",
    "around", "upon", "as",
];

/// Words that already start a *where* ("at my desk", "in the kitchen", "outside").
const WHERE_WORDS: [&str; 15] = [
    "in", "at", "on", "by", "near", "outside", "inside", "under", "beside", "next", "from",
    "around", "behind", "over", "into",
];

/// A time of day by the hour cycle: "07:00" or "7:00 AM".
pub fn time_label(minute_of_day: u16, cycle: HourCycle) -> String {
    format_clock(u64::from(minute_of_day) * MINUTE_MS, 0, cycle)
}

/// "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri"; `None` for a mask outside 1–127.
pub fn days_label(bits: u8) -> Option<String> {
    Weekdays::from_bits(bits).map(Weekdays::label)
}

/// The implementation intention: "I will drink a glass of water at 7:00 in the kitchen."
pub fn intention(name: &str, when: Option<&str>, place: Option<&str>) -> String {
    let mut sentence = format!("I will {}", lower_first(bare(name)));
    if let Some(when) = when.map(bare).filter(|text| !text.is_empty()) {
        if when.starts_with(|c: char| c.is_ascii_digit()) {
            sentence.push_str(&format!(" at {when}"));
        } else {
            sentence.push_str(&format!(" {}", led(when, &WHEN_WORDS, "")));
        }
    }
    if let Some(place) = place.map(bare).filter(|text| !text.is_empty()) {
        sentence.push_str(&format!(" {}", led(place, &WHERE_WORDS, "in ")));
    }
    sentence.push('.');
    sentence
}

/// The anchor: "After I wake up, I will drink a glass of water." A leading "After" the person
/// typed is not repeated.
pub fn anchor_line(anchor: Option<&str>, name: &str) -> Option<String> {
    let anchor = bare(anchor?);
    let cue = match anchor.get(..6) {
        Some(head) if head.eq_ignore_ascii_case("after ") => anchor[6..].trim_start(),
        _ => anchor,
    };
    (!cue.is_empty()).then(|| {
        format!(
            "After {}, I will {}.",
            lower_first(cue),
            lower_first(bare(name))
        )
    })
}

/// The run of days, from 2 up: "5 days kept". Never a big number, never a flame.
pub fn run_line(days: u16) -> Option<String> {
    (days >= 2).then(|| format!("{days} days kept"))
}

/// Today's progress through a routine of `total` habits, `done` of them checked in today.
pub fn today_line(today: RoutineToday, done: usize, total: usize) -> String {
    match today {
        RoutineToday::NotStarted => "Not started today".to_owned(),
        RoutineToday::InProgress => format!("{done} of {total} done today"),
        RoutineToday::Finished => format!("Done today, {done} of {total}"),
    }
}

/// A template step for the template dialog: "Electrolytes (optional)", or with its evidence
/// line: "Delay caffeine 90–120 minutes (optional). The evidence is contested."
pub fn template_step(step: &TemplateStep) -> String {
    let mut line = step.name.to_owned();
    if step.optional {
        line.push_str(" (optional)");
    }
    if let Some(detail) = step.detail {
        line.push_str(&format!(". {detail}"));
    }
    line
}

/// The text without surrounding whitespace or a closing full stop.
fn bare(text: &str) -> &str {
    text.trim().trim_end_matches('.').trim_end()
}

/// `text` as it continues a sentence, led by `prefix` unless its first word is one of `words`.
/// Only a typed lead word is lowered ("Every morning"); any other text keeps its capitals, so
/// "Monday mornings" and "London office" stay as typed.
fn led(text: &str, words: &[&str], prefix: &str) -> String {
    let first = text
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_lowercase();
    if words.contains(&first.as_str()) {
        lower_first(text)
    } else {
        format!("{prefix}{text}")
    }
}

/// Lowers a capital that only starts a sentence: "Drink water" becomes "drink water", while
/// "I wake up", "I'm up" and "NSDR afterwards" stay as typed (the second character is not a
/// lower-case letter).
fn lower_first(text: &str) -> String {
    let mut chars = text.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    match chars.next() {
        Some(second) if first.is_uppercase() && second.is_lowercase() => {
            first.to_lowercase().chain(text.chars().skip(1)).collect()
        }
        _ => text.to_owned(),
    }
}
