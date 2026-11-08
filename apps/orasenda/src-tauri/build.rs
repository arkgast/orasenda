include!("commands.list.rs");

/// Common Controls v6 manifest that tauri-build would otherwise embed (#32).
const WINDOWS_MANIFEST: &str = "windows-app-manifest.xml";

fn main() {
    let mut attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    if embed_windows_manifest() {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    if let Err(error) = tauri_build::try_build(attributes) {
        panic!("tauri-build failed: {error:#}");
    }
}

/// On Windows MSVC, link the Common Controls v6 manifest into every linked
/// target, the lib unittest binary included, and report whether it did.
///
/// tauri-build embeds its manifest through `cargo:rustc-link-arg-bins`, so the
/// `orasenda_lib` test exe has none and fails to load with
/// STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139). `rustc-link-arg-tests` would not
/// help: it only reaches integration tests, never lib unittests. Hence the
/// manifest goes in through the linker for all targets, and tauri-build's
/// copy is turned off so the bin does not get two.
fn embed_windows_manifest() -> bool {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return false;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set");
    let manifest = std::path::Path::new(&manifest_dir).join(WINDOWS_MANIFEST);
    println!("cargo:rerun-if-changed={WINDOWS_MANIFEST}");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    true
}
