use super::super::names::{parse, unique};
use super::TempDir;
use crate::api::BackupKind;

#[test]
fn names_round_trip_and_suffix() {
    let dir = TempDir::new();
    // 2026-11-03 09:12:05 UTC.
    let ms = 1_793_697_125_000;
    for kind in [
        BackupKind::Auto,
        BackupKind::Manual,
        BackupKind::BeforeImport,
        BackupKind::BeforeRestore,
    ] {
        let name = unique(dir.path(), ms, kind);
        assert_eq!(parse(&name), Some((ms, kind, 1)), "{name}");
    }
    let first = unique(dir.path(), ms, BackupKind::Manual);
    assert_eq!(first, "orasenda-20261103T091205Z-manual.db");
    std::fs::write(dir.path().join(&first), b"x").unwrap();
    let second = unique(dir.path(), ms, BackupKind::Manual);
    assert_eq!(second, "orasenda-20261103T091205Z-manual-2.db");
    std::fs::write(dir.path().join(&second), b"x").unwrap();
    let third = unique(dir.path(), ms, BackupKind::Manual);
    assert_eq!(third, "orasenda-20261103T091205Z-manual-3.db");
    assert_eq!(parse(&third), Some((ms, BackupKind::Manual, 3)));
    for other in [
        "notes.db",
        "orasenda.db",
        "orasenda-20261103T091205Z-manual.db.partial",
        "orasenda-20261103T091205Z-weekly.db",
        "orasenda-20261103T091205Z-manual-1.db",
        "orasenda-20261103T091205Z-manual-02.db",
        "orasenda-20261103T091205Z-manual-+2.db",
        "orasenda-20261331T091205Z-manual.db",
        "orasenda-20260231T091205Z-manual.db",
        "orasenda-20261103T256205Z-manual.db",
        "orasenda-2026110T091205Z-manual.db",
    ] {
        assert_eq!(parse(other), None, "{other}");
    }
}
