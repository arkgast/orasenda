// App commands, one list for `build.rs` (the `AppManifest`) and the crate (the manifest test).
// Every command here must be registered in `specta_builder()` and granted in a capability.
pub const COMMANDS: &[&str] = &["app_info"];
