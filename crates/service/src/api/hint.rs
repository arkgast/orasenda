//! The one-time hints Today can show.

use serde::{Deserialize, Serialize};

/// A hint the timer view can carry. Each is shown once, ever.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Hint {
    /// After the first manual "+10 min": *Keep going automatically* lives in Settings › Timer.
    KeepGoing,
}
