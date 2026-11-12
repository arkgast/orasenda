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
        todo!()
    }
}

/// The line for the `n`th break of this kind today (`n` counts that kind only).
pub fn pick(_kind: BreakFor, _n: usize) -> &'static Suggestion {
    todo!()
}

#[cfg(test)]
mod tests;
