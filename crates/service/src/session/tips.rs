//! The welcome line and the two one-time tips (spec: Hotkeys and capture, Welcome and tips).
//!
//! The state is device-only `meta` flags, read once at launch and kept in memory. A tip is due
//! after its session end until it is seen: on Got it, on use, or on its second showing. Nothing
//! is shown or counted while the store can't read or write, so a tip can never repeat.

use orasenda_store::{focus_sessions, meta};

use super::hint::{Seen, rfc3339_utc};
use super::*;
use crate::api::{StoreStatus, TipId, TipSeen};

/// The `meta` key set at the first Start on this device.
const META_WELCOME_DONE: &str = "onboard.welcome_done";
/// The global-shortcut tip: `"1"` after its first showing, `"seen"` once done.
pub(super) const META_TIP_GLOBAL: &str = "tip.global_shortcut";
/// The Focus-view tip, as above.
const META_TIP_FOCUS: &str = "tip.focus_view";
/// When a Focus window or the floater was first opened (RFC 3339, UTC).
const META_USED_FOCUS_VIEW: &str = "used.focus_view";

const SEEN: &str = "seen";
const ONCE: &str = "1";

/// How far a tip got.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(super) enum Flag {
    #[default]
    Fresh,
    /// Shown once.
    Once,
    Seen,
}

impl Flag {
    fn from_meta(value: Option<String>) -> Flag {
        match value.as_deref() {
            None => Flag::Fresh,
            Some(ONCE) => Flag::Once,
            Some(_) => Flag::Seen,
        }
    }

    fn text(self) -> &'static str {
        if self == Flag::Fresh {
            ""
        } else if self == Flag::Once {
            ONCE
        } else {
            SEEN
        }
    }
}

#[derive(Debug, Default)]
pub(super) struct TipState {
    /// The launch read worked; until then (and after a failed read) nothing shows.
    ready: bool,
    welcome_done: bool,
    /// Rows this device has recorded.
    rows: u64,
    /// Sessions that ended on this device.
    ended: u64,
    global: Flag,
    focus: Flag,
    used_focus: bool,
    /// The start or pause shortcut is registered and VoiceOver is off (fed by the keyboard service).
    shortcut_usable: bool,
}

impl SessionService {
    /// The startup read of the flags and the session count.
    pub(super) fn load_tips(&mut self) {
        let Some(store) = &self.store else { return };
        let read = store.read(|txn| {
            let (rows, ended) = focus_sessions::counts(txn)?;
            Ok((
                rows,
                ended,
                meta::get(txn, META_WELCOME_DONE)?.is_some(),
                Flag::from_meta(meta::get(txn, META_TIP_GLOBAL)?),
                Flag::from_meta(meta::get(txn, META_TIP_FOCUS)?),
                meta::get(txn, META_USED_FOCUS_VIEW)?.is_some(),
            ))
        });
        match read {
            Ok((rows, ended, welcome_done, global, focus, used_focus)) => {
                let usable = self.tips.shortcut_usable;
                self.tips = TipState {
                    ready: true,
                    welcome_done,
                    rows,
                    ended,
                    global,
                    focus,
                    used_focus,
                    shortcut_usable: usable,
                };
            }
            Err(error) => eprintln!("tips: the flags could not be read ({error}); no tips"),
        }
    }

    /// The keyboard service says whether ⌃⌥F-style start or pause works (registered, no VoiceOver).
    pub(crate) fn set_shortcut_usable(&mut self, usable: bool) {
        self.tips.shortcut_usable = usable;
    }

    /// The tips and the welcome line may show: the store reads and writes.
    fn tips_live(&self) -> bool {
        self.tips.ready && self.store_status == StoreStatus::Ok
    }

    /// The welcome line: a true first run, idle.
    pub(super) fn welcome_due(&self, idle: bool) -> bool {
        idle && self.tips_live() && !self.tips.welcome_done && self.tips.rows == 0
    }

    /// The tip to show now, idle only. The Focus-view tip comes after the second end; until then
    /// (and again once it is seen) the shortcut tip is the one due.
    pub(super) fn tip_due(&self, idle: bool) -> Option<TipId> {
        if !idle || !self.tips_live() {
            return None;
        }
        let tips = &self.tips;
        if tips.ended >= 2 && tips.focus != Flag::Seen && !tips.used_focus {
            return Some(if self.settings.single_key {
                TipId::FocusViewKeys
            } else {
                TipId::FocusView
            });
        }
        if tips.ended >= 1 && tips.global != Flag::Seen && self.hint.used_global != Seen::Yes {
            return Some(if tips.shortcut_usable {
                TipId::GlobalShortcut
            } else {
                TipId::GlobalShortcutMenu
            });
        }
        None
    }

    /// A session ended (`records` as written). Counts it for the tips.
    pub(super) fn note_session_ended(&mut self, records: &[orasenda_core::SessionRecord]) {
        self.tips.rows += records.len() as u64;
        if records
            .first()
            .is_some_and(|first| first.phase == orasenda_core::Phase::Focus)
        {
            self.tips.ended += 1;
        }
    }

    /// The first Start on this device ends the welcome line, for good.
    pub(super) fn note_started(&mut self, now_ms: u64) {
        if !self.tips.ready || self.tips.welcome_done {
            return;
        }
        self.tips.welcome_done = true;
        if let Err(error) = self.write_owed(now_ms, |txn| meta::set(txn, META_WELCOME_DONE, SEEN)) {
            eprintln!("tips: could not remember {META_WELCOME_DONE} ({error})");
        }
    }

    /// Today showed a tip, or the person pressed Got it. It moves on for this run whatever
    /// happens; a failed write is logged here and shown by the store status.
    pub(super) fn mark_tip(&mut self, tip: TipId, how: TipSeen, now_ms: u64) {
        let (flag, key) = match tip {
            TipId::GlobalShortcut | TipId::GlobalShortcutMenu => {
                (&mut self.tips.global, META_TIP_GLOBAL)
            }
            TipId::FocusView | TipId::FocusViewKeys => (&mut self.tips.focus, META_TIP_FOCUS),
        };
        let next = match (how, *flag) {
            (_, Flag::Seen) => return,
            (TipSeen::GotIt, _) | (TipSeen::Shown, Flag::Once) => Flag::Seen,
            (TipSeen::Shown, Flag::Fresh) => Flag::Once,
        };
        *flag = next;
        if let Err(error) = self.write_owed(now_ms, |txn| meta::set(txn, key, next.text())) {
            eprintln!("tips: could not remember {key} ({error}); hidden for this run");
        }
    }

    /// A Focus window or the floater opened: remember the first time, once. It also marks the
    /// Focus-view tip seen.
    pub(super) fn note_focus_view_opened(&mut self, now_ms: u64) {
        if !self.tips.ready || self.tips.used_focus {
            return;
        }
        self.tips.used_focus = true;
        self.tips.focus = Flag::Seen;
        let stamp = rfc3339_utc(now_ms);
        if let Err(error) = self.write_owed(now_ms, |txn| {
            meta::set(txn, META_USED_FOCUS_VIEW, &stamp)?;
            meta::set(txn, META_TIP_FOCUS, SEEN)
        }) {
            eprintln!("tips: could not remember {META_USED_FOCUS_VIEW} ({error})");
        }
    }

    /// ⌃⌥F was used: its tip is seen.
    pub(super) fn global_shortcut_used(&mut self) {
        self.tips.global = Flag::Seen;
    }
}
