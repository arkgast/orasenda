# Orasenda

A calm, minimal, local-first app for focus, time blocking and tasks. Features:
- Pomodoro-style timer with a full-screen clock
- Kanban board with time tracked per task
- Built-in calendar for time blocking
- Routines and habits, with evidence-informed templates
- Opt-in app tracking and kind distraction blocking

**Status:** specification. Implementation has not started.

- [Product spec](docs/SPEC.md)
- [Roadmap](docs/ROADMAP.md)
- [Decision log](docs/DECISIONS.md)
- [Design system (Claude Design)](https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73), the source of truth for tokens, components and UI rules

> Wellness suggestions in Orasenda are not medical advice.

## Getting started

### Prerequisites
For the desktop app (macOS):
- [rustup](https://rustup.rs). The toolchain (Rust 1.99.1) and the `aarch64-apple-ios` and
  `aarch64-linux-android` targets install themselves from `rust-toolchain.toml`.
- Node 24 (24.22.2 or newer).
- pnpm 12, the version pinned in the `packageManager` field of `package.json`.
- [just](https://just.systems).
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30 or newer, used by `just ci`.
- Xcode (the full app, not only the Command Line Tools).

For iOS, also:
- An iOS Simulator runtime, installed from Xcode.
- xcodegen, libimobiledevice and CocoaPods. The Tauri CLI installs them through Homebrew the first
  time they are needed.

For Android, also:
- The Android SDK with `platforms`, `build-tools`, `platform-tools` and `cmdline-tools;latest`.
  Android Studio installs these. So does `brew install --cask android-commandlinetools`, followed by
  `sdkmanager`.
- The Android NDK. r29 is known to work.
- A JDK from 17 to 26. 21 is recommended: `brew install openjdk@21`. The JDK bundled with Android
  Studio (JBR) also works. The Gradle wrapper does not run on newer JDKs.

Android builds read three environment variables. Set them in your shell, for example:
```sh
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
# or Android Studio's JDK: "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```
The Tauri CLI adds the other Android Rust targets (`armv7-linux-androideabi`, `i686-linux-android`,
`x86_64-linux-android`) when it needs them.

### Commands
- `just dev` runs the desktop app with hot reload.
- `just build` builds the release app (a .app and .dmg on macOS).
- `just ci` runs every check that CI runs.
- `pnpm --filter orasenda tauri ios dev` runs the app in the iOS Simulator. Add a device name to
  pick one, for example `pnpm --filter orasenda tauri ios dev "iPhone 16"`.
- `pnpm --filter orasenda tauri android dev` runs the app on an Android emulator or a connected
  device.

`just --list` shows every recipe.

### Mobile projects and signing
The Xcode and Android Studio projects live in `apps/orasenda/src-tauri/gen/apple` and
`apps/orasenda/src-tauri/gen/android`. They are the output of `tauri ios init` and
`tauri android init`. Keep changes to them small, so they can be regenerated.

The iOS Simulator needs no signing. To run on a physical iPhone, set your Apple development team
in your shell only:
```sh
export APPLE_DEVELOPMENT_TEAM=<team id>
```
Never commit a development team, certificate or keystore, and don't add the team to
`tauri.conf.json`.

## Licence
Orasenda is free and open source under the [Mozilla Public License 2.0](LICENSE).
Copyright © 2026 Arnold Gandarillas Castillo and contributors.

- Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Commits are signed off under
  the [DCO](DCO); there is no CLA.
- The Orasenda name and logo are trademarks: see [TRADEMARKS.md](TRADEMARKS.md). Forks are welcome
  under a different name.
- Bundled fonts and other third-party components keep their own licences.
