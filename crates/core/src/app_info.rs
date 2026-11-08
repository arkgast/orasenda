//! What the app reports about itself: name, version and the platform it runs on.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Operating system family, serialized lowercase (`"macos"`, …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
    Linux,
    Ios,
    Android,
    Other,
}

impl Os {
    /// Maps a `std::env::consts::OS` value. Unknown values map to [`Os::Other`].
    pub fn from_consts(os: &str) -> Os {
        match os {
            "macos" => Os::Macos,
            "windows" => Os::Windows,
            "linux" => Os::Linux,
            "ios" => Os::Ios,
            "android" => Os::Android,
            _ => Os::Other,
        }
    }
}

/// App name and version (from the caller, never from core's own Cargo metadata) and the
/// platform it runs on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: Os,
    pub arch: String,
}

impl AppInfo {
    /// Keeps `name` and `version`; fills `os` and `arch` from `std::env::consts`.
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> AppInfo {
        AppInfo {
            name: name.into(),
            version: version.into(),
            os: Os::from_consts(std::env::consts::OS),
            arch: std::env::consts::ARCH.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_from_consts_known_values() {
        assert_eq!(Os::from_consts("macos"), Os::Macos);
        assert_eq!(Os::from_consts("windows"), Os::Windows);
        assert_eq!(Os::from_consts("linux"), Os::Linux);
        assert_eq!(Os::from_consts("ios"), Os::Ios);
        assert_eq!(Os::from_consts("android"), Os::Android);
    }

    #[test]
    fn os_from_consts_unknown_is_other() {
        assert_eq!(Os::from_consts("freebsd"), Os::Other);
        assert_eq!(Os::from_consts(""), Os::Other);
        assert_eq!(Os::from_consts("MacOS"), Os::Other);
    }

    #[test]
    fn os_serializes_lowercase() {
        let cases = [
            (Os::Macos, "macos"),
            (Os::Windows, "windows"),
            (Os::Linux, "linux"),
            (Os::Ios, "ios"),
            (Os::Android, "android"),
            (Os::Other, "other"),
        ];
        for (os, name) in cases {
            assert_eq!(serde_json::to_value(os).unwrap(), name);
        }
    }

    #[test]
    fn app_info_new_keeps_name_and_version_and_fills_os_arch() {
        let info = AppInfo::new("Orasenda", String::from("9.8.7"));
        assert_eq!(info.name, "Orasenda");
        assert_eq!(info.version, "9.8.7");
        assert_eq!(info.os, Os::from_consts(std::env::consts::OS));
        assert_eq!(info.arch, std::env::consts::ARCH);
    }
}
