use super::file_at_version;
use crate::portability::{Probe, ProbeError, probe};
use crate::test_support::TempDir;

#[test]
fn probe_reads_versions() {
    let dir = TempDir::new("probe-versions");
    for version in [1, 5] {
        let path = dir.path().join(format!("v{version}.db"));
        file_at_version(&path, version);
        assert_eq!(
            probe(&path),
            Ok(Probe {
                user_version: version,
                has_device_id: true
            })
        );
    }
    let future = dir.path().join("v99.db");
    file_at_version(&future, 5);
    rusqlite::Connection::open(&future)
        .expect("opens")
        .pragma_update(None, "user_version", 99)
        .expect("sets");
    assert_eq!(probe(&future).expect("probes").user_version, 99);
}

#[test]
fn probe_empty_sqlite_is_not_orasenda() {
    let dir = TempDir::new("probe-empty");
    let path = dir.path().join("empty.db");
    rusqlite::Connection::open(&path)
        .expect("creates")
        .execute_batch("CREATE TABLE other (x INTEGER)")
        .expect("writes");
    assert_eq!(
        probe(&path),
        Ok(Probe {
            user_version: 0,
            has_device_id: false
        })
    );
}

#[test]
fn probe_text_file_not_sqlite() {
    let dir = TempDir::new("probe-text");
    let path = dir.path().join("notes.txt");
    std::fs::write(
        &path,
        "just some words, long enough to not be a database header at all",
    )
    .expect("writes");
    assert_eq!(probe(&path), Err(ProbeError::NotSqlite));
}

#[test]
fn probe_missing_file_is_io() {
    let dir = TempDir::new("probe-missing");
    assert!(matches!(
        probe(&dir.path().join("nope.db")),
        Err(ProbeError::Io(_))
    ));
}

#[test]
fn probe_never_writes() {
    let dir = TempDir::new("probe-readonly");
    let path = dir.path().join("v5.db");
    file_at_version(&path, 5);
    let bytes = std::fs::read(&path).expect("reads");
    let mtime = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .expect("mtime");
    probe(&path).expect("probes");
    assert_eq!(std::fs::read(&path).expect("reads"), bytes);
    let after = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .expect("mtime");
    assert_eq!(after, mtime);
}

#[test]
fn probe_wal_file_leaves_no_siblings() {
    let dir = TempDir::new("probe-wal");
    let path = dir.path().join("wal.db");
    file_at_version(&path, 5);
    rusqlite::Connection::open(&path)
        .expect("opens")
        .pragma_update(None, "journal_mode", "WAL")
        .expect("wal");
    for sibling in ["wal.db-wal", "wal.db-shm"] {
        let _ = std::fs::remove_file(dir.path().join(sibling));
    }
    probe(&path).expect("probes");
    assert!(!dir.path().join("wal.db-wal").exists());
    assert!(!dir.path().join("wal.db-shm").exists());
}

#[test]
fn probe_meta_without_key_column() {
    let dir = TempDir::new("probe-nokey");
    let path = dir.path().join("odd.db");
    rusqlite::Connection::open(&path)
        .expect("creates")
        .execute_batch("CREATE TABLE meta (name TEXT, value TEXT)")
        .expect("writes");
    assert!(!probe(&path).expect("probes").has_device_id);
}
