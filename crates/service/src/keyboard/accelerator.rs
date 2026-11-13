//! An accelerator: modifiers and one `KeyboardEvent.code`, in one canonical text form.
//!
//! Canonical form: the modifiers in the order Control, Alt, Shift, Super, then the code, joined
//! by `+` ("Control+Alt+KeyF"). [`Accelerator::parse`] accepts the parts in any order.

use std::fmt;

/// Why a text is not an accelerator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    Empty,
    /// A part that is neither a modifier nor a known key code.
    UnknownKey(String),
    /// A modifier named twice.
    Duplicate(String),
    /// No key code, or more than one.
    NeedsOneKey,
    /// A global shortcut needs Control, Alt or Super: a bare key or Shift alone would take typing.
    NeedsModifier,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Empty => f.write_str("no keys"),
            ParseError::UnknownKey(part) => write!(f, "unknown key {part:?}"),
            ParseError::Duplicate(part) => write!(f, "{part} is named twice"),
            ParseError::NeedsOneKey => f.write_str("a shortcut has exactly one key"),
            ParseError::NeedsModifier => f.write_str("a shortcut needs Control, Option or Command"),
        }
    }
}

/// The modifiers in canonical order: name, glyph, spoken word.
const MODIFIERS: [(&str, &str, &str); 4] = [
    ("Control", "⌃", "Control"),
    ("Alt", "⌥", "Option"),
    ("Shift", "⇧", "Shift"),
    ("Super", "⌘", "Command"),
];

/// The keys beyond letters and digits, as the recorder and the Kbd key table have them: code,
/// glyph, spoken word.
const NAMED_KEYS: [(&str, &str, &str); 10] = [
    ("Period", ".", "Period"),
    ("Comma", ",", "Comma"),
    ("Enter", "↩", "Return"),
    ("Space", "Space", "Space"),
    ("Tab", "Tab", "Tab"),
    ("Backspace", "⌫", "Delete"),
    ("ArrowLeft", "←", "Left Arrow"),
    ("ArrowUp", "↑", "Up Arrow"),
    ("ArrowRight", "→", "Right Arrow"),
    ("ArrowDown", "↓", "Down Arrow"),
];

/// The glyph and the spoken word of a key code, or `None` for a code the recorder never emits.
fn key_names(code: &str) -> Option<(String, String)> {
    if let Some(letter) = code.strip_prefix("Key")
        && letter.len() == 1
        && letter.as_bytes()[0].is_ascii_uppercase()
    {
        return Some((letter.into(), letter.into()));
    }
    if let Some(digit) = code.strip_prefix("Digit")
        && digit.len() == 1
        && digit.as_bytes()[0].is_ascii_digit()
    {
        return Some((digit.into(), digit.into()));
    }
    NAMED_KEYS
        .iter()
        .find(|(name, _, _)| *name == code)
        .map(|(_, glyph, spoken)| ((*glyph).into(), (*spoken).into()))
}

/// Modifiers (a flag per entry of `MODIFIERS`) and a key code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accelerator {
    mods: [bool; 4],
    code: String,
}

impl Accelerator {
    /// Parses "Control+Alt+KeyF" (any order of parts). A global shortcut needs one key and at
    /// least one of Control, Alt and Super.
    pub fn parse(text: &str) -> Result<Accelerator, ParseError> {
        if text.trim().is_empty() {
            return Err(ParseError::Empty);
        }
        let mut mods = [false; 4];
        let mut code: Option<String> = None;
        for part in text.split('+') {
            if let Some(at) = MODIFIERS.iter().position(|(name, _, _)| *name == part) {
                if mods[at] {
                    return Err(ParseError::Duplicate(part.into()));
                }
                mods[at] = true;
            } else if key_names(part).is_some() {
                if code.replace(part.into()).is_some() {
                    return Err(ParseError::NeedsOneKey);
                }
            } else {
                return Err(ParseError::UnknownKey(part.into()));
            }
        }
        let code = code.ok_or(ParseError::NeedsOneKey)?;
        if !(mods[0] || mods[1] || mods[3]) {
            return Err(ParseError::NeedsModifier);
        }
        Ok(Accelerator { mods, code })
    }

    /// The canonical text, as it is saved.
    pub fn canonical(&self) -> String {
        let mut parts: Vec<&str> = MODIFIERS
            .iter()
            .zip(self.mods)
            .filter_map(|((name, _, _), on)| on.then_some(*name))
            .collect();
        parts.push(&self.code);
        parts.join("+")
    }

    /// The keys as glyphs, modifiers first: "⌃⌥F".
    pub fn describe(&self) -> String {
        let glyphs: String = MODIFIERS
            .iter()
            .zip(self.mods)
            .filter_map(|((_, glyph, _), on)| on.then_some(*glyph))
            .collect();
        let key = key_names(&self.code)
            .map(|(glyph, _)| glyph)
            .unwrap_or_default();
        format!("{glyphs}{key}")
    }

    /// The keys as words: "Control-Option-F".
    pub fn spoken(&self) -> String {
        let mut words: Vec<String> = MODIFIERS
            .iter()
            .zip(self.mods)
            .filter(|(_, on)| *on)
            .map(|((_, _, spoken), _)| (*spoken).to_string())
            .collect();
        words.extend(key_names(&self.code).map(|(_, spoken)| spoken));
        words.join("-")
    }

    /// The key code ("KeyF").
    pub fn code(&self) -> &str {
        &self.code
    }

    /// Whether Control, Alt, Shift or Super is held, in canonical order.
    pub fn modifiers(&self) -> [bool; 4] {
        self.mods
    }
}

/// Shortcuts the app menu and the command palette already use: ⌘K, ⇧⌘F, ⇧⌘T, ⌘,, ⌘↩, ⇧⌘↩ and ⌘..
const MENU_KEYS: [&str; 7] = [
    "Super+KeyK",
    "Shift+Super+KeyF",
    "Shift+Super+KeyT",
    "Super+Comma",
    "Super+Enter",
    "Shift+Super+Enter",
    "Super+Period",
];

/// Whether an app menu shortcut uses these keys.
pub fn is_menu_shortcut(acc: &Accelerator) -> bool {
    let canonical = acc.canonical();
    MENU_KEYS.contains(&canonical.as_str())
}
