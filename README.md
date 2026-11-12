# Orasenda

A calm, minimal, local-first app for focus, time blocking and tasks. Features:
- Pomodoro-style timer with a full-screen clock
- Kanban board with time tracked per task
- Built-in calendar for time blocking
- Routines and habits, with evidence-informed templates
- Opt-in app tracking and kind distraction blocking

**Status:** early development. The P0 foundations (the Tauri app shell and the macOS blocking spike)
are built; the app is not ready for everyday use yet. See the [Roadmap](docs/ROADMAP.md).

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
- Xcode (the full app, not only the Command Line Tools). `just ci` checks the core crate for iOS,
  which needs the iOS SDK.
- The Android NDK (r29 is known to work). `just ci` checks the store crate for Android, which
  compiles SQLite with the NDK's clang. It uses the first NDK it finds: `ANDROID_NDK_HOME`,
  `NDK_HOME`, `ANDROID_NDK_LATEST_HOME`, then the newest folder under
  `${ANDROID_HOME:-$HOME/Library/Android/sdk}/ndk/`. Android Studio's SDK Manager installs it
  there, so no variable is needed.

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
The Tauri CLI adds the other Rust targets it needs, for example `aarch64-apple-ios-sim` and
`x86_64-linux-android`, the first time it builds for them.

### Claude Code cloud sessions (Linux)
`scripts/cloud-setup.sh` installs everything `just ci` needs on the Ubuntu image that cloud sessions
use: the Tauri Linux libraries, Xvfb, Node 24.22.2, pnpm 12.18.0, just, gitleaks, the Rust
toolchain and the workspace's packages. Use it as the environment's setup script:
```sh
if [ -d orasenda ]; then bash orasenda/scripts/cloud-setup.sh; fi
```
or run `./scripts/cloud-setup.sh` as root from the repo root. On Linux `just ci` skips the macOS-only
steps (the WebKit layout checks and the mobile check). Its last step builds a debug app; to see
it, run `xvfb-run -a target/debug/orasenda` and screenshot the display. Focus views and other
macOS-only features are unavailable there.

### Commands
- `just dev` runs the desktop app with hot reload.
- `just build` builds the release app (a .app and .dmg on macOS).
- `just ci` runs every check that CI runs.
- `pnpm --filter orasenda tauri ios dev` runs the app in the iOS Simulator. Add a device name to
  pick one, for example `pnpm --filter orasenda tauri ios dev "iPhone 16"`.
- `pnpm --filter orasenda tauri android dev` runs the app on an Android emulator.

`just --list` shows every recipe.

To run on a physical iPhone, connect it and pass its name to the same command. The Tauri CLI sets
`TAURI_DEV_HOST` to your computer's network address for a physical iPhone (or when you pass
`--host`), and `vite.config.ts` then serves the frontend on that address (HMR on port 1421). The
device and the computer must be on the same network, and iOS asks for Local Network permission on
the first run. With `TAURI_DEV_HOST` set, the dev server listens on the network with no access
control, so use a trusted network.

Android devices reach the dev server over USB through `adb reverse`, so no network is needed and
`TAURI_DEV_HOST` stays unset. Without it, the dev server stays on localhost.

### Mobile projects and signing
The Xcode and Android Studio projects live in `apps/orasenda/src-tauri/gen/apple` and
`apps/orasenda/src-tauri/gen/android`. They are the output of `tauri ios init` and
`tauri android init`. Keep changes to them small, so they can be regenerated.

Opening `apps/orasenda/src-tauri/gen/android` in Android Studio needs a release that supports AGP
9.3.1. Command-line builds don't need Android Studio. If Android Studio offers to upgrade AGP,
decline: the project stays as `tauri android init` generated it.

The iOS Simulator needs no signing. To run on a physical iPhone, set your Apple development team
in your shell only:
```sh
export APPLE_DEVELOPMENT_TEAM=<team id>
```
Never commit a development team, certificate or keystore, and don't add the team to
`tauri.conf.json`. The Tauri CLI may write the team into
`apps/orasenda/src-tauri/gen/apple/orasenda.xcodeproj/project.pbxproj` when
`APPLE_DEVELOPMENT_TEAM` is set. Don't commit that change: run
`git restore apps/orasenda/src-tauri/gen/apple` before committing.

## Licence
Orasenda is free and open source under the [Mozilla Public License 2.0](LICENSE).
Copyright © 2026 Arnold Gandarillas Castillo and contributors.

- Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Commits are signed off under
  the [DCO](DCO); there is no CLA.
- The Orasenda name and logo are trademarks: see [TRADEMARKS.md](TRADEMARKS.md). Forks are welcome
  under a different name.
- Bundled fonts and other third-party components keep their own licences.
