# Orasenda: Common Issues

Known problems and their fixes, added as they come up.

- **`mockIPC` never removes event listeners (@tauri-apps/api 2.12.4).** With `shouldMockEvents: true`, the mock's `handleRemoveListener` reads `args.id` but `event.js` sends `eventId`, so an unlistened handler stays registered. Tests that assert unsubscription count listen/unlisten calls themselves (see `apps/orasenda/src/App.test.tsx`), and unmount before `clearMocks()`.
- **specta-typescript 0.0.13 exports `f64` as `number | null`.** For integers below 2^53 use `#[specta(type = specta_typescript::Number)]` (ADR-007).
- **`-[NSRunningApplication hide]` / `unhide` return NO even when they work (macOS 27.0.1).** The app hides (`didHideApplicationNotification` fires, `isHidden` turns true once the run loop turns), from the main thread or any other, whether or not the caller is active. A `Refused` from `MacAppControl::hide` is therefore not proof the app is visible; the spike logs it as "hide returned NO … (unreliable on macOS 27)", and a non-regular pid is `Other("not a regular app")` instead. Activating a hidden app unhides it, so never activate the app you just hid (#41). Observed with a throwaway Swift probe (`hidden` read after pumping the run loop):
  ```
  Notion Calendar, not active:
  bg-thread hide() -> false     after bg hide: hidden=true active=false
  unhide -> false               after unhide: hidden=false
  main-thread hide() -> false   after main hide: hidden=true active=false
  target active, caller inactive: hide -> false   after hide: hidden=true front=Safari
  caller regular and active:      hide -> false   after hide: hidden=true
  Ghostty, not active:
  bg hide -> false
    [0.06s] didHide Ghostty
  [1.56s] after hide: hidden=true active=false
  ```
- **Windows: the `orasenda_lib` unittest exe dies at startup with `0xc0000139, STATUS_ENTRYPOINT_NOT_FOUND` and no test output (tauri-build 2.7.4).** Tauri imports Common Controls v6 entry points, which only resolve when the exe carries the Common Controls v6 manifest. tauri-build embeds that manifest through `cargo:rustc-link-arg-bins` (via embed-resource), so `main.rs` gets it and test binaries don't. `cargo:rustc-link-arg-tests` is no fix: Cargo applies it to integration tests only, never to lib unittests. `apps/orasenda/src-tauri/build.rs` therefore turns tauri-build's manifest off (`WindowsAttributes::new_without_app_manifest()`) on Windows MSVC and links `windows-app-manifest.xml` into every target with `/MANIFEST:EMBED /MANIFESTINPUT:` (#32). The `windows (advisory)` CI job running the lib tests is the regression test.
