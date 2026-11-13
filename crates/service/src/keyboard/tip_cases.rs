//! How shortcut status and VoiceOver pick the global-shortcut tip's variant.

use std::sync::Arc;

use orasenda_core::NotificationStatus;

use super::*;
use crate::api::TipId;
use crate::scheduler::Host;
use crate::session::lock;
use crate::session::test_support::*;

/// A host whose first session has ended, so the global-shortcut tip is due.
fn rig_with_tip() -> (TestHost, KeyboardService, Arc<FakeRegistrar>) {
    let host = TestHost::fresh(NotificationStatus::Granted);
    let registrar = Arc::new(FakeRegistrar::default());
    let kb = KeyboardService::new(registrar.clone());
    {
        let mut service = lock(host.service().expect("service"));
        service.apply(start_quick(), T0, id("q0"));
        service.tick(T0 + 2 * MINUTE);
    }
    (host, kb, registrar)
}

fn tip(host: &TestHost) -> Option<TipId> {
    lock(host.service().expect("service"))
        .view(T0 + 3 * MINUTE)
        .tip
}

#[test]
fn tip_variant_follows_status_and_voice_over() {
    let (host, kb, _) = rig_with_tip();
    kb.register_saved(&host);
    assert_eq!(tip(&host), Some(TipId::GlobalShortcut), "registered");
    kb.set_voice_over(&host, true);
    assert_eq!(tip(&host), Some(TipId::GlobalShortcutMenu), "VoiceOver on");
    kb.set_voice_over(&host, false);
    assert_eq!(tip(&host), Some(TipId::GlobalShortcut), "VoiceOver off");

    kb.set_shortcut(&host, ShortcutId::StartPause, None)
        .expect("off");
    assert_eq!(tip(&host), Some(TipId::GlobalShortcutMenu), "shortcut off");
}

#[test]
fn tip_names_the_menu_when_register_fails() {
    let (host, kb, registrar) = rig_with_tip();
    registrar.set_failing(true);
    kb.register_saved(&host);
    assert_eq!(tip(&host), Some(TipId::GlobalShortcutMenu), "failed");
}
