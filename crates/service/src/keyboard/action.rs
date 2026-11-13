//! The ids of the registry (ADR-020): the six actions, the two slots a key can sit in, and
//! where a press can come from. `ActionId` replaces `ShortcutId` in H3b2; both exist until then.

/// One action of the shortcut registry. The declaration order is the registry order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ActionId {
    FullScreen,
    FullScreenOther,
    LeaveFullScreen,
    Floater,
    StartPause,
    Capture,
}

impl ActionId {
    /// Every action, in registry order.
    pub const ALL: [ActionId; 6] = [
        ActionId::FullScreen,
        ActionId::FullScreenOther,
        ActionId::LeaveFullScreen,
        ActionId::Floater,
        ActionId::StartPause,
        ActionId::Capture,
    ];

    /// The name used in setting keys: `keys.app.<name>` and `keys.global.<name>`.
    pub fn name(self) -> &'static str {
        match self {
            ActionId::FullScreen => "full_screen",
            ActionId::FullScreenOther => "full_screen_other",
            ActionId::LeaveFullScreen => "leave_full_screen",
            ActionId::Floater => "floater",
            ActionId::StartPause => "start_pause",
            ActionId::Capture => "capture",
        }
    }

    /// The action with this setting-key name.
    pub fn from_name(name: &str) -> Option<ActionId> {
        ActionId::ALL.into_iter().find(|id| id.name() == name)
    }
}

/// Where an action is bound. `App` is *In Orasenda* (an app-menu accelerator), `Global` is
/// *Everywhere* (a global shortcut). `App` comes first in registry order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Slot {
    App,
    Global,
}

impl Slot {
    pub const ALL: [Slot; 2] = [Slot::App, Slot::Global];

    /// The setting-key prefix: `keys.app` or `keys.global`.
    pub fn prefix(self) -> &'static str {
        match self {
            Slot::App => "keys.app",
            Slot::Global => "keys.global",
        }
    }
}

/// Where a press of a key reached the one entry point from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Menu,
    Monitor,
    Global,
    Tray,
    Webview,
}
