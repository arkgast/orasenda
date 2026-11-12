//! Break suggestions: one gentle line per break, rotating. Pure; no clock, no I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Which kind of break a line is for. E7 maps the engine's break kind onto this.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BreakFor {
    Short,
    Long,
}

/// How firmly a line is backed by evidence. Unlabelled lines have a source or are plain product principle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionLabel {
    Optional,
    Experimental,
}

/// One suggestion line and its label, if any.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Suggestion {
    pub text: &'static str,
    pub label: Option<SuggestionLabel>,
}

impl Suggestion {
    /// The line as shown: "Optional: look at something far away."
    pub fn line(&self) -> String {
        let word = match self.label {
            Some(SuggestionLabel::Optional) => "Optional",
            Some(SuggestionLabel::Experimental) => "Experimental",
            None => return self.text.to_owned(),
        };
        let mut chars = self.text.chars();
        let rest = chars
            .next()
            .map(|c| c.to_lowercase().chain(chars).collect::<String>());
        format!("{word}: {}", rest.unwrap_or_default())
    }
}

/// The line for the `n`th break of this kind today (`n` counts that kind only).
pub fn pick(kind: BreakFor, n: usize) -> &'static Suggestion {
    let fits = |e: &&Entry| match kind {
        BreakFor::Short => e.short,
        BreakFor::Long => e.long,
    };
    let count = LIST.iter().filter(fits).count();
    LIST.iter()
        .filter(fits)
        .nth(n % count)
        .map(|e| &e.suggestion)
        .expect("both lists are non-empty")
}

struct Entry {
    suggestion: Suggestion,
    short: bool,
    long: bool,
}

const fn entry(
    text: &'static str,
    label: Option<SuggestionLabel>,
    short: bool,
    long: bool,
) -> Entry {
    Entry {
        suggestion: Suggestion { text, label },
        short,
        long,
    }
}

use SuggestionLabel::{Experimental, Optional};

/// The list, in rotation order. Source check, 2026-11-12 (controller ruling 15): a line ships only
/// with a source someone has opened, or with a label. Verified sources: Albulescu et al. 2022
/// (micro-breaks, vigor and fatigue), Biwer et al. 2023 (the case for breaks, not any one line),
/// Balban et al. 2023 (5-minute daily breathwork). Every other line is labelled until it has one.
static LIST: [Entry; 10] = [
    // Albulescu 2022.
    entry("Stand up and stretch gently.", None, true, true),
    // Unverified: labelled.
    entry("Look at something far away.", Some(Optional), true, false),
    // Unverified: labelled (was unlabelled in the first spec draft).
    entry("Take a slow sip of water.", Some(Optional), true, false),
    // Balban 2023 tested a daily practice, not one sigh: labelled.
    entry(
        "Breathe in twice, then out long.",
        Some(Optional),
        true,
        false,
    ),
    // Albulescu 2022.
    entry("Walk to another room.", None, true, true),
    // Unverified: labelled.
    entry(
        "Step outside for some daylight.",
        Some(Optional),
        false,
        true,
    ),
    // Buch et al. 2021 tested motor skills only: labelled.
    entry(
        "Sit quietly and let your mind wander.",
        Some(Experimental),
        false,
        true,
    ),
    // Unverified: labelled.
    entry(
        "Close your eyes and rest for a few minutes.",
        Some(Experimental),
        false,
        true,
    ),
    // Product principle (SPEC 2.1): breaks steer away from the phone.
    entry("Leave your phone where it is.", None, true, true),
    // Unverified: labelled.
    entry(
        "Make a warm drink and sip it slowly.",
        Some(Optional),
        false,
        true,
    ),
];

#[cfg(test)]
mod tests;
