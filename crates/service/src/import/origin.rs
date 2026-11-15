//! Origin keys: where an imported task came from (spec Domain model, Origin).

/// `todoist:` plus the first 32 hex digits of SHA-256 over `project \u{1f} title \u{1f} n`,
/// where `n` counts earlier rows with the same project and title (CSV rows have no id).
pub(crate) fn todoist(_project: &str, _title: &str, _n: u32) -> String {
    String::new()
}
