//! orasenda-core must not branch on the target OS (ADR-001).
//! Scans `src` for `target_os`, `target_family`, `target_vendor` and `cfg(unix)` / `cfg(windows)`
//! (also inside `cfg_attr`, `any`, `all`, `not`), skipping lines that start with `//`.

use std::fs;
use std::path::Path;

const WORDS: [&str; 3] = ["target_os", "target_family", "target_vendor"];

fn is_ident(c: Option<char>) -> bool {
    c.is_some_and(|c| c.is_alphanumeric() || c == '_')
}

/// True when `line` holds `unix` or `windows` as a whole word right after `(` or `,` / space
/// inside a `cfg(...)` or `cfg_attr(...)` and followed by `,` or `)`.
fn mentions_family_cfg(line: &str) -> bool {
    if !line.contains("cfg") {
        return false;
    }
    for word in ["unix", "windows"] {
        for (i, _) in line.match_indices(word) {
            let before = line[..i].chars().next_back();
            let rest = line[i + word.len()..].trim_start();
            let after_ok = rest.starts_with(',') || rest.starts_with(')');
            let before_ok = matches!(before, Some('(' | ',' | ' '));
            if before_ok && after_ok && !is_ident(before) {
                return true;
            }
        }
    }
    false
}

fn offends(line: &str) -> bool {
    if line.trim_start().starts_with("//") {
        return false;
    }
    WORDS.iter().any(|w| line.contains(w)) || mentions_family_cfg(line)
}

fn scan(dir: &Path, hits: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .map(|e| e.expect("directory entry").path())
        .collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            scan(&path, hits);
        } else if path.extension().is_some_and(|e| e == "rs") {
            let text = fs::read_to_string(&path).expect("read source file");
            for (n, line) in text.lines().enumerate() {
                if offends(line) {
                    hits.push(format!("{}:{}: {}", path.display(), n + 1, line.trim()));
                }
            }
        }
    }
}

#[test]
fn core_source_does_not_branch_on_the_target_os() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut hits = Vec::new();
    scan(&src, &mut hits);
    assert!(
        hits.is_empty(),
        "orasenda-core must not branch on the target OS (ADR-001):\n{}",
        hits.join("\n")
    );
}
