# Orasenda: Decision Log

Architecture and product decisions, one entry each, newest last. Use the template below.

## Template
### ADR-NNN: Title
- **Date:**
- **Status:** proposed | accepted | superseded by ADR-XXX
- **Context:** what forces the decision
- **Options considered:**
- **Decision:**
- **Consequences:** trade-offs and follow-ups

## Pending (to resolve in P0 Foundations)
- ADR-002: Local storage engine and future sync model (CRDT or event log, end-to-end encrypted)
- ADR-003: macOS distribution (notarized direct download vs Mac App Store)
- ADR-004: macOS app-blocking approach (detection, overlay, hide or close, anti-quit helper)
- ADR-005: macOS usage-tracking approach and permissions
- ADR-006: Business model for public launch

_ADR-007 is taken by the typed IPC contract below._

## ADR-001: Tech stack and code sharing
- **Date:** 2026-11-07
- **Status:** accepted (revisit if the P0 detection-and-overlay spike shows Tauri cannot host it)
- **Context:** SPEC §7 asks for the stack that best shares code across desktop, web and mobile. The hardest features are native: foreground-app detection, overlays, an anti-quit helper, idle detection. Timers, blocking and tracking must keep running while the window is hidden, but WebKit throttles timers in hidden pages and macOS App Nap throttles hidden apps. Targets: macOS first, Windows next, iOS and Android later, a web app in P10.
- **Options considered:**
  1. **Tauri 2 + React + a Rust core:** native APIs reachable from Rust on every OS; the same Rust runs on iOS and Android through Tauri mobile; small, fast app. Each OS renders with its own webview (WebKit, WebView2), and Tauri mobile is younger than desktop.
  2. **Electron + TypeScript:** mature, one Chromium everywhere; heavy for a menu-bar app, native work needs Node addons, no mobile.
  3. **Native SwiftUI, Kotlin/WinUI later:** best macOS fit; no code sharing across platforms.
  4. **Flutter:** one UI everywhere; native work through platform channels in several languages, Dart for logic, weaker desktop accessibility.
  5. **React Native / Expo with react-native-macos and -windows:** strong mobile; desktop ports lag, native modules per OS.
  For where the logic lives: (A) a Rust core and React only renders; (B) TypeScript logic with thin Rust adapters; (C) split by feature.
- **Decision:** Tauri 2 (2.12.x) with React 19 and TypeScript, option A. Product logic lives in `crates/core`: plain Rust, no Tauri, no OS-specific code, time passed in as input. The Tauri app crate wires core to commands and events; React renders state and sends intents. Platform tiers: **macOS 13+ gating** (required CI), **Windows 11 advisory** (CI runs, never blocks), **iOS and Android scaffolded and smoke-tested by hand** (no mobile features until P10). Rust is pinned in `rust-toolchain.toml` (1.99.1) and bumped by PR.
- **Consequences:**
  - OS integrations (App Nap activity assertion, foreground-app detection, overlays) go in the app crate or a future platform crate behind an interface, never in core. The spike decides that layout.
  - Every core dependency must build for `aarch64-apple-ios` and `aarch64-linux-android`; `scripts/ci.sh` checks it.
  - The P10 web app needs core compiled to WebAssembly or served; keeping `SystemTime::now()` out of core preserves that option.
  - Both WebKit and WebView2 must be exercised; until a Windows machine is set up, Windows is covered only by CI.
  - Tauri 3 is in alpha (3.0.0-alpha.6); migrate once it is stable and tauri-specta supports it.
  - Spec: [docs/specs/2026-11-07-app-shell.md](specs/2026-11-07-app-shell.md).

## ADR-007: Typed IPC contract with tauri-specta 2
- **Date:** 2026-11-07
- **Status:** accepted
- **Context:** Rust commands and events need matching TypeScript types; hand-kept types drift silently. The only maintained generator covering commands *and* events for Tauri 2 is tauri-specta 2, which has only release candidates (2.0.0-rc.26, 2026-10-21) and requires exact pins of its siblings.
- **Options considered:**
  1. **tauri-specta 2 RC, exact-pinned:** typed commands and events, generated `bindings.ts`; pre-release.
  2. **ts-rs 12:** stable, but types only: commands and events stay hand-written.
  3. **Hand-written types plus a contract test:** no dependency; the test is the generator we would be writing.
- **Decision:** Option 1. Pin `tauri-specta =2.0.0-rc.26`, `specta =2.0.0-rc.26`, `specta-typescript =0.0.13` in `[workspace.dependencies]`. `bindings.ts` is generated, committed and checked for staleness in `scripts/ci.sh`. 64-bit integers are exported as `number` explicitly with `#[specta(type = specta_typescript::Number)]` where values stay below 2^53.
- **Consequences:** upgrades move the three pins together. Exit plan: if tauri-specta 2 has no release for 6 months or blocks a Tauri upgrade, switch to option 3, keeping the committed `bindings.ts` as the starting point.
