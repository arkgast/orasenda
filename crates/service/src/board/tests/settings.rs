use super::*;
use crate::api::{ColumnSettings, Settings, SettingsErrorKind};
use crate::session::{lock, run_set_settings};

fn with_buffer(host: &TestHost, buffer: u8) -> Settings {
    Settings {
        board_estimate_buffer: buffer,
        ..lock(&host.0.service).settings()
    }
}

/// The settings as a fresh launch reads them from the store.
fn reloaded(host: &TestHost) -> Settings {
    let mut service = lock(&host.0.service);
    service.reload_after_import(T0);
    service.settings()
}

#[test]
fn a_new_buffer_emits_the_board_once_after_the_lock() {
    let host = host();
    let mut task = draft("A", Lane::TODAY);
    task.estimate = Some(4);
    run_task_add(&host, task).expect("adds");
    changed(&host);
    run_set_settings(&host, with_buffer(&host, 50)).expect("saves");
    let events = changed(&host);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].1.buffer, 50);
    assert_eq!(events[0].1.today_planned, 6, "ceil(4 * 1.5)");
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
    run_set_settings(&host, with_buffer(&host, 50)).expect("saves again");
    assert!(
        changed(&host).is_empty(),
        "an unchanged buffer emits nothing"
    );
}

#[test]
fn a_buffer_outside_the_set_is_refused() {
    let host = host();
    for bad in [33, 55, 20, 0] {
        let error = run_set_settings(&host, with_buffer(&host, bad)).expect_err("refused");
        assert_eq!(error.kind, SettingsErrorKind::InvalidSpec);
    }
    assert_eq!(lock(&host.0.service).settings().board_estimate_buffer, 25);
    assert!(changed(&host).is_empty());
}

#[test]
fn a_stored_buffer_outside_the_set_reads_as_25() {
    let host = host();
    run_set_settings(&host, with_buffer(&host, 40)).expect("saves");
    assert_eq!(
        reloaded(&host).board_estimate_buffer,
        40,
        "kept across a reload"
    );
    let service = lock(&host.0.service);
    service
        .store()
        .expect("store")
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "board.estimate_buffer", &33u8)
        })
        .expect("written");
    drop(service);
    assert_eq!(reloaded(&host).board_estimate_buffer, 25);
}

#[test]
fn the_settings_loader_tolerates_the_columns_row() {
    let host = host();
    let named = |lane, name: &str| ColumnSettings {
        lane,
        name: name.into(),
        limit: None,
    };
    let columns = vec![
        named(Lane::BACKLOG, "Later"),
        ColumnSettings {
            limit: Some(5),
            ..named(Lane::TODAY, "Now")
        },
        ColumnSettings {
            limit: Some(2),
            ..named(Lane::DOING, "Busy")
        },
        named(Lane::DONE, "Finished"),
    ];
    run_board_columns_set(&host, columns).expect("saves");
    assert_eq!(reloaded(&host), Settings::default(), "read from the store");
}
