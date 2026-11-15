use std::sync::Arc;

use orasenda_core::platform::import::{SourceAccess, UnbundledReminders};

use super::*;
use crate::api::{ImportSourceKind::*, REMINDERS_UNBUNDLED, SESSION_ACTIVE};
use crate::import::run_import_sources;
use crate::session::test_support::{FakeReminders, FakeThings};

fn kinds(host: &TestHost) -> Vec<(crate::api::ImportSourceKind, bool, Option<String>)> {
    run_import_sources(host)
        .sources
        .into_iter()
        .map(|s| (s.kind, s.available, s.reason))
        .collect()
}

#[test]
fn sources_without_platform_is_todoist_only() {
    assert_eq!(kinds(&host()), vec![(Todoist, true, None)]);
}

#[test]
fn sources_unbundled_reminders_reason() {
    let host = host();
    host.0.imports.set_reminders(Arc::new(UnbundledReminders));
    host.0.imports.set_things(FakeThings::new(Ok("[]".into())));
    assert_eq!(
        kinds(&host),
        vec![
            (Reminders, false, Some(REMINDERS_UNBUNDLED.to_owned())),
            (Todoist, true, None),
            (Things, true, None),
        ]
    );
}

#[test]
fn sources_disabled_while_session_active() {
    let host = host();
    host.0
        .imports
        .set_reminders(FakeReminders::new(SourceAccess::Granted, Vec::new()));
    host.0.imports.set_things(FakeThings::new(Ok("[]".into())));
    start_session(&host);
    let reason = Some(SESSION_ACTIVE.to_owned());
    assert_eq!(
        kinds(&host),
        vec![
            (Reminders, false, reason.clone()),
            (Todoist, true, None),
            (Things, false, reason),
        ]
    );
}
