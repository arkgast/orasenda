//! Origin keys: where an imported task came from (spec Domain model, Origin).

use sha2::{Digest, Sha256};

/// `todoist:` plus the first 32 hex digits of SHA-256 over `project \u{1f} title \u{1f} n`,
/// where `n` counts earlier rows with the same project and title (CSV rows have no id).
pub(crate) fn todoist(project: &str, title: &str, n: u32) -> String {
    let mut hash = Sha256::new();
    hash.update(project.as_bytes());
    hash.update([0x1f]);
    hash.update(title.as_bytes());
    hash.update([0x1f]);
    hash.update(n.to_string().as_bytes());
    let digest = hash.finalize();
    let hex: String = digest[..16].iter().map(|b| format!("{b:02x}")).collect();
    format!("todoist:{hex}")
}
