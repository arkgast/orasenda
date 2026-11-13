//! Keys the system owns: the two lists of ADR-020, each entry with a plain reason.

use super::Accelerator;

/// The line shown for every never-delivered key.
const KEPT: &str = "macOS keeps this key, so it won't reach Orasenda.";

/// Keys macOS never delivers (refused in both slots): canonical text, then glyphs for the
/// tests. Esc and the backtick have no recorder code yet, so those two entries match only once
/// the accelerator grammar learns them.
pub(super) const NEVER_DELIVERED: &[(&str, &str)] = &[
    ("Super+Tab", "⌘Tab"),
    ("Shift+Super+Tab", "⇧⌘Tab"),
    ("Super+Space", "⌘Space"),
    ("Control+Space", "⌃Space"),
    ("Alt+Super+Escape", "⌥⌘Esc"),
    ("Control+Super+KeyQ", "⌃⌘Q"),
    ("Shift+Super+Digit3", "⇧⌘3"),
    ("Shift+Super+Digit4", "⇧⌘4"),
    ("Shift+Super+Digit5", "⇧⌘5"),
    ("Control+ArrowUp", "⌃↑"),
    ("Control+ArrowDown", "⌃↓"),
    ("Control+ArrowLeft", "⌃←"),
    ("Control+ArrowRight", "⌃→"),
];

/// Well-known keys (warned before use *Everywhere*): canonical text, glyphs, reason.
pub(super) const WELL_KNOWN: &[(&str, &str, &str)] = &[
    ("Super+KeyQ", "⌘Q", "⌘Q quits the app in most apps."),
    ("Super+KeyW", "⌘W", "⌘W closes the window in most apps."),
    ("Super+KeyH", "⌘H", "⌘H hides the app in most apps."),
    ("Super+KeyM", "⌘M", "⌘M minimizes the window in most apps."),
    ("Super+KeyF", "⌘F", "⌘F searches in most apps."),
    ("Super+KeyT", "⌘T", "⌘T opens a new tab in most apps."),
    (
        "Shift+Super+KeyT",
        "⇧⌘T",
        "⇧⌘T reopens a closed tab in most apps.",
    ),
    ("Super+KeyN", "⌘N", "⌘N opens a new window in most apps."),
    ("Super+KeyC", "⌘C", "⌘C copies in every app."),
    ("Super+KeyV", "⌘V", "⌘V pastes in every app."),
    ("Super+KeyX", "⌘X", "⌘X cuts in every app."),
    ("Super+KeyZ", "⌘Z", "⌘Z undoes in most apps."),
    ("Shift+Super+KeyZ", "⇧⌘Z", "⇧⌘Z redoes in most apps."),
    ("Super+KeyA", "⌘A", "⌘A selects all in most apps."),
    ("Super+KeyS", "⌘S", "⌘S saves in most apps."),
    ("Super+KeyP", "⌘P", "⌘P prints in most apps."),
    ("Super+KeyO", "⌘O", "⌘O opens a file in most apps."),
    ("Super+KeyR", "⌘R", "⌘R reloads in most apps."),
    (
        "Super+Backquote",
        "⌘`",
        "⌘` switches between windows of an app.",
    ),
    (
        "Alt+Super+Space",
        "⌥⌘Space",
        "⌥⌘Space opens a Finder search.",
    ),
    (
        "Control+Super+Space",
        "⌃⌘Space",
        "⌃⌘Space opens the emoji picker.",
    ),
    (
        "Control+Super+KeyF",
        "⌃⌘F",
        "⌃⌘F makes a window full screen in many apps.",
    ),
];

/// The reason macOS never delivers `acc`, or `None` when it can be used.
pub fn never_delivered(acc: &Accelerator) -> Option<&'static str> {
    let canonical = acc.canonical();
    NEVER_DELIVERED
        .iter()
        .any(|(keys, _)| *keys == canonical)
        .then_some(KEPT)
}

/// The reason `acc` is worth a warning before use *Everywhere*, or `None`. Any Option-only
/// chord counts: it types characters on most layouts.
pub fn well_known(acc: &Accelerator) -> Option<&'static str> {
    let canonical = acc.canonical();
    if let Some((_, _, reason)) = WELL_KNOWN.iter().find(|(keys, _, _)| *keys == canonical) {
        return Some(reason);
    }
    let [control, alt, _shift, sup] = acc.modifiers();
    (alt && !control && !sup).then_some("Option keys type characters in most apps.")
}
