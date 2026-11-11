// App commands, one list for `build.rs` (the `AppManifest`) and the crate (the manifest test).
// Every command here must be registered in `specta_builder()` and granted in a capability.
pub const COMMANDS: &[&str] = &[
    "app_info",
    "timer_state",
    "timer_start",
    "timer_pause",
    "timer_resume",
    "timer_stop",
    "settings_get",
    "settings_set",
    "notifications_request",
    "notifications_open_settings",
    "navigate_take",
    "presets_get",
    "native_menu_popup",
    "spike_status",
    "spike_running_apps",
    "spike_rule",
    "spike_set_rule",
    "spike_usage",
    "spike_overlay_ready",
    "spike_overlay_choice",
];
