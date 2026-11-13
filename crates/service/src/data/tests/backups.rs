use orasenda_store::SCHEMA_VERSION;
use orasenda_store::portability::probe;

use super::super::backups::{create, delete, due, folder, list, prune};
use super::super::policy;
use super::{DAY, T0, TempDir, get_meta, open, set_meta, set_user_version};
use crate::api::{BackupEntry, BackupFrequency, BackupKind, BackupPolicy, DataErrorKind};

fn keep(store: &orasenda_store::Store, keep: u32) {
    let policy = BackupPolicy {
        frequency: BackupFrequency::Monthly,
        keep,
    };
    policy::write(store, &policy, 1).expect("policy written");
}

fn entry(kind: BackupKind, created_ms: u64) -> BackupEntry {
    BackupEntry {
        file: "f".into(),
        kind,
        created_ms,
        bytes: 1,
        newer: false,
    }
}

#[test]
fn create_makes_backups_folder() {
    let dir = TempDir::new();
    let store = open(dir.path());
    assert!(!folder(dir.path()).exists());
    let made = create(&store, dir.path(), BackupKind::Manual, T0).expect("created");
    assert!(folder(dir.path()).join(&made.file).is_file());
    assert_eq!(made.kind, BackupKind::Manual);
    assert!(made.bytes > 0);
    assert_eq!(list(dir.path()), vec![made]);
}

#[test]
fn list_drops_unrecognised_keeps_newer() {
    let dir = TempDir::new();
    let store = open(dir.path());
    let good = create(&store, dir.path(), BackupKind::Auto, T0).unwrap();
    let newer = create(&store, dir.path(), BackupKind::Manual, T0 + 1000).unwrap();
    let newer_path = folder(dir.path()).join(&newer.file);
    set_user_version(&newer_path, SCHEMA_VERSION + 1);
    let text = folder(dir.path()).join("orasenda-20261103T000000Z-auto.db");
    std::fs::write(&text, "not a database").unwrap();
    let empty = folder(dir.path()).join("orasenda-20261104T000000Z-auto.db");
    std::fs::write(&empty, b"").unwrap();
    let stray = folder(dir.path()).join("notes.txt");
    std::fs::write(&stray, "mine").unwrap();

    let listed = list(dir.path());
    assert_eq!(listed.len(), 2);
    assert_eq!(
        (listed[0].file.as_str(), listed[0].newer),
        (newer.file.as_str(), true)
    );
    assert_eq!(
        (listed[1].file.as_str(), listed[1].newer),
        (good.file.as_str(), false)
    );
    assert!(
        !text.exists() && !empty.exists(),
        "unrecognised backups are dropped"
    );
    assert!(stray.exists(), "other files are never touched");
    // The live store is in WAL mode; its copy keeps the schema version in the header.
    let probed = probe(&folder(dir.path()).join(&good.file)).unwrap();
    assert_eq!(probed.user_version, SCHEMA_VERSION);
    assert!(probed.has_device_id);
}

#[test]
fn create_prunes_all_kinds_to_keep() {
    let dir = TempDir::new();
    let store = open(dir.path());
    keep(&store, 3);
    let kinds = [
        BackupKind::Auto,
        BackupKind::Manual,
        BackupKind::BeforeImport,
        BackupKind::BeforeRestore,
        BackupKind::Manual,
    ];
    for (i, kind) in kinds.into_iter().enumerate() {
        create(&store, dir.path(), kind, T0 + i as u64 * 2000).unwrap();
    }
    let listed = list(dir.path());
    let times: Vec<u64> = listed.iter().map(|e| e.created_ms).collect();
    assert_eq!(times, vec![T0 + 8000, T0 + 6000, T0 + 4000]);
    // Lowering keep prunes at once.
    policy::apply(
        &store,
        dir.path(),
        &BackupPolicy {
            frequency: BackupFrequency::Monthly,
            keep: 1,
        },
        2,
    )
    .unwrap();
    assert_eq!(list(dir.path()).len(), 1);
    prune(dir.path(), 1);
    assert_eq!(list(dir.path()).len(), 1);
}

#[test]
fn create_never_prunes_new_backup() {
    let dir = TempDir::new();
    let store = open(dir.path());
    keep(&store, 1);
    let newer = create(&store, dir.path(), BackupKind::Auto, T0 + DAY).unwrap();
    // A clock that went backwards: the new backup sorts oldest but stays.
    let made = create(&store, dir.path(), BackupKind::Manual, T0).unwrap();
    let listed = list(dir.path());
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].file, made.file);
    assert_ne!(made.file, newer.file);
}

#[test]
fn delete_refuses_traversal_and_unknown() {
    let dir = TempDir::new();
    let store = open(dir.path());
    let made = create(&store, dir.path(), BackupKind::Manual, T0).unwrap();
    let outside = dir.path().join("orasenda-20261103T000000Z-manual.db");
    std::fs::copy(folder(dir.path()).join(&made.file), &outside).unwrap();
    for name in [
        "../orasenda-20261103T000000Z-manual.db".to_string(),
        format!("sub/{}", made.file),
        "..".to_string(),
        "orasenda.db".to_string(),
        "orasenda-20200101T000000Z-auto.db".to_string(),
        String::new(),
    ] {
        let error = delete(dir.path(), &name).expect_err(&name);
        assert_eq!(error.kind, DataErrorKind::NotFound, "{name}");
    }
    assert!(outside.exists() && dir.path().join("orasenda.db").exists());
    delete(dir.path(), &made.file).expect("a listed name goes");
    assert!(list(dir.path()).is_empty());
}

#[test]
fn due_boundaries_monthly_quarterly() {
    let monthly = BackupPolicy::default();
    let quarterly = BackupPolicy {
        frequency: BackupFrequency::Quarterly,
        ..monthly
    };
    let auto = [entry(BackupKind::Auto, T0)];
    assert!(!due(&auto, &monthly, T0 + 30 * DAY - 1));
    assert!(due(&auto, &monthly, T0 + 30 * DAY));
    assert!(!due(&auto, &quarterly, T0 + 91 * DAY - 1));
    assert!(due(&auto, &quarterly, T0 + 91 * DAY));
    assert!(due(&[], &monthly, T0), "none yet");
    // Only the newest automatic backup counts.
    let two = [
        entry(BackupKind::Auto, T0),
        entry(BackupKind::Auto, T0 + 20 * DAY),
    ];
    assert!(!due(&two, &monthly, T0 + 40 * DAY));
}

#[test]
fn due_ignores_manual_and_safety() {
    let policy = BackupPolicy::default();
    let others = [
        entry(BackupKind::Manual, T0),
        entry(BackupKind::BeforeImport, T0),
        entry(BackupKind::BeforeRestore, T0),
    ];
    assert!(due(&others, &policy, T0 + DAY));
}

#[test]
fn policy_defaults_on_bad_values() {
    let dir = TempDir::new();
    let store = open(dir.path());
    assert_eq!(policy::read(&store), BackupPolicy::default());
    for (frequency, keep) in [
        ("weekly", "0"),
        ("", "51"),
        ("Quarterly", "abc"),
        ("x", "-3"),
    ] {
        set_meta(&store, "backup.frequency", frequency);
        set_meta(&store, "backup.keep", keep);
        assert_eq!(
            policy::read(&store),
            BackupPolicy::default(),
            "{frequency} {keep}"
        );
    }
    set_meta(&store, "backup.frequency", "quarterly");
    set_meta(&store, "backup.keep", "50");
    assert_eq!(
        policy::read(&store),
        BackupPolicy {
            frequency: BackupFrequency::Quarterly,
            keep: 50
        }
    );
}

#[test]
fn policy_keep_range() {
    let dir = TempDir::new();
    let store = open(dir.path());
    for bad in [0, 51, 1000] {
        let policy = BackupPolicy {
            frequency: BackupFrequency::Quarterly,
            keep: bad,
        };
        assert!(policy::write(&store, &policy, 1).is_err(), "{bad}");
    }
    assert_eq!(
        get_meta(&store, "backup.keep"),
        None,
        "a refused write stores nothing"
    );
    for good in [1, 50] {
        let want = BackupPolicy {
            frequency: BackupFrequency::Quarterly,
            keep: good,
        };
        assert_eq!(policy::write(&store, &want, 1).unwrap(), want);
        assert_eq!(get_meta(&store, "backup.keep"), Some(good.to_string()));
        assert_eq!(
            get_meta(&store, "backup.frequency").as_deref(),
            Some("quarterly")
        );
    }
}
