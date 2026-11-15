//! The import commands: the panel before a Todoist preview, the platform choice, and who may
//! call them. No panel opens and no source is read.

use std::sync::Arc;

use orasenda_core::NotificationStatus;
use orasenda_core::platform::import::SourceAccess;
use orasenda_service::api::{DataError, DataErrorKind, ImportErrorKind, ImportSourceKind};
use orasenda_service::session::SessionService;
use orasenda_service::session::test_support::{TestHost, fakes};

use super::capabilities::capability;
use super::data_files::FakePicker;
use crate::commands::{ImportPreviewOutcome, import_preview_with};

fn host() -> TestHost {
    let f = fakes(NotificationStatus::NotDetermined, false);
    let store = orasenda_service::session::open_store_at(
        &std::env::temp_dir().join(format!("orasenda-i8-{}", uuid::Uuid::now_v7())),
        "device-i8",
    );
    TestHost::with(
        SessionService::new(store, f.platform, 1_794_009_600_000),
        f.log,
        f.notifier,
    )
}

#[test]
fn import_preview_cancelled_panel() {
    let picker = FakePicker::new(Ok(None));
    let outcome = import_preview_with(&host(), &picker, ImportSourceKind::Todoist).unwrap();
    assert_eq!(outcome, ImportPreviewOutcome::Cancelled);
    assert_eq!(picker.asked(), 1);
}

#[test]
fn import_preview_picker_error_is_unreadable() {
    let picker = FakePicker::new(Err(DataError::new(DataErrorKind::Unavailable, "no panel")));
    let error = import_preview_with(&host(), &picker, ImportSourceKind::Todoist).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Unreadable);
    assert_eq!(picker.asked(), 1);
}

#[test]
fn import_preview_other_sources_show_no_panel() {
    let picker = FakePicker::new(Ok(None));
    // No source is installed in the test host, so each answers an error, never a panel.
    for kind in [ImportSourceKind::Reminders, ImportSourceKind::Things] {
        assert!(import_preview_with(&host(), &picker, kind).is_err());
    }
    assert_eq!(picker.asked(), 0);
}

#[test]
fn import_commands_in_main_capability_only() {
    let commands = [
        "import-sources",
        "import-preview",
        "import-discard",
        "task-import",
        "task-import-undo",
        "import-open-settings",
    ];
    let (_, main) = capability("main.json");
    for command in commands {
        let permission = format!("allow-{command}");
        assert!(main.contains(&permission), "main lacks {permission}");
        for file in ["floater.json", "capture.json", "dev.json", "overlay.json"] {
            assert!(
                !capability(file).1.contains(&permission),
                "{file} grants {permission}"
            );
        }
    }
}

#[test]
fn choose_reminders_outside_bundle_is_unavailable() {
    let reminders = crate::platform::choose_reminders(false);
    assert_eq!(reminders.access(), SourceAccess::Unavailable);
    assert_eq!(reminders.request(), SourceAccess::Unavailable);
    assert!(reminders.read().is_err());
    let _: Arc<dyn orasenda_core::platform::import::RemindersSource> = reminders;
}

#[cfg(not(target_os = "macos"))]
#[test]
fn host_sources_none_off_macos() {
    let sources = crate::platform::import_sources();
    assert!(sources.reminders.is_none());
    assert!(sources.things.is_none());
}
