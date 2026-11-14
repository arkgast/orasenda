# HS spikes: key route, Esc in full screen, floater over full screen

- **Date:** 2026-11-13
- **Task:** HS (#446). Feeds H3a2 (#450) and H4a (#457).
- **Spec:** [Structure, keys, focus and Settings](../specs/2026-11-13-polish-structure-keys-focus-settings.md), H3 step 2 and H4 step 1.
- **Status:** **not decided.** All three answers need a run on an unlocked Mac (see "What happened" below).

## Answers

| # | Question | Answer | Confidence |
|---|----------|--------|------------|
| 1 | While the non-activating floater is key, does an app-menu accelerator (⇧⌘T, ⌘K) reach the menu handler? *Menu* or *Monitor*? | **Owner hands-on needed** (or a rerun with the Mac unlocked) | none: no key event reached the app |
| 2 | Esc in native full screen: which layer gets it (a) with the webview focused, (b) after an *Everywhere* entry from another app, (c) with the palette open? Does AppKit's `cancelOperation:` leave full screen on its own? | **Owner hands-on needed** | none: native full screen could not be entered |
| 3 | Does the floater show over `main`'s native full-screen Space? | **Owner hands-on needed** | none: native full screen could not be entered |

## What happened

The instrumented build (patch in Appendix A) built and launched. The session was **locked** (`ioreg` reported `CGSSessionScreenIsLocked = true`; `frontmost` was `loginwindow`). While a Mac is locked:

- System Events keystrokes go to the login window, not to apps. The run sent ⇧⌘T, ⌘K, ⌃⌥⌘T, ⌃⌥⌘D and two Spaces. The app logged **no** `NSEvent keyDown`, no `MENU EVENT` and no global shortcut. Two Spaces landed in the lock screen's password field and were deleted at once (no Return was sent). The scripts now refuse to run while the screen is locked.
- Apps can't be activated. Both `set frontmost` and `tell application "Finder" to activate` left `ghostty` reported as frontmost.
- Native full screen fails. `set_fullscreen(true)` returned `Ok`, the window reported full screen for about 100 ms, then went back (log below).

Q1 run while locked (`q1.sh`): the app saw no keys at all.

```
[369705] === app setup ===
[369705] globals registered: Ok(()) Ok(()) Ok(())
[369810] POLL main.fullscreen=Some(false) main.visible=Some(true) main.focused=Some(false) floater.exists=false floater.visible=None
[------] ### STEP: launched, frontmost=ghostty
[------] ### STEP: Orasenda frontmost requested, frontmost=ghostty
[------] ### STEP: Q1.0 send shift-cmd-T with main key (opens floater)
[------] ### STEP: Q1.1 floater key, Orasenda frontmost=ghostty: send shift-cmd-T
[------] ### STEP: Q1.1b send cmd-K (palette)
[------] ### STEP: Finder activated, frontmost=ghostty
[------] ### STEP: Q1.2 global ctrl-opt-cmd-T to make floater key without activation
[------] ### STEP: Q1.2a frontmost=ghostty; send shift-cmd-T
[------] ### STEP: Q1.2b send space (webview control)
[------] ### STEP: Q1.2c global dump
[------] ### STEP: Q1.2d send cmd-K
[------] ### STEP: end frontmost=ghostty
```

Q3 automatic run while locked (`HS_AUTO=1`: full screen by code, then `open_floater`): full screen did not hold, so the floater result says nothing about a full-screen Space.

```
[449975] === app setup ===
[449975] globals registered: Ok(()) Ok(()) Ok(())
[450080] POLL main.fullscreen=Some(false) main.visible=Some(true) main.focused=Some(false) floater.exists=false floater.visible=None
[452980] AUTO set_fullscreen(true) -> Ok(())
[452981] dump[auto-before-fs] main: Ok("title=\"Orasenda\" visible=true key=false main=false onActiveSpace=true occlusionVisible=false fullScreen=false level=0 | appActive=false frontmost=\"loginwindow\" keyWindow=\"<none>\"")
[453002] POLL main.fullscreen=Some(true) main.visible=Some(true) main.focused=Some(false) floater.exists=false floater.visible=None
[453106] POLL main.fullscreen=Some(false) main.visible=Some(true) main.focused=Some(false) floater.exists=false floater.visible=None
[456983] dump[auto-after-fs] main: Ok("title=\"Orasenda\" visible=true key=false main=false onActiveSpace=true occlusionVisible=false fullScreen=false level=0 | appActive=false frontmost=\"loginwindow\" keyWindow=\"<none>\"")
[457016] AUTO open_floater -> Ok(())
[457031] POLL main.fullscreen=Some(false) main.visible=Some(false) main.focused=Some(false) floater.exists=true floater.visible=Some(true)
[459022] AUTO set_fullscreen(false) -> Ok(())
[459022] dump[auto-floater-over-fs] floater: Ok("title=\"Orasenda timer\" visible=true key=false main=false onActiveSpace=true occlusionVisible=false fullScreen=false level=3 | appActive=false frontmost=\"loginwindow\" keyWindow=\"<none>\"")
[459022] dump[auto-floater-over-fs] main: Ok("title=\"Orasenda\" visible=false key=false main=false onActiveSpace=true occlusionVisible=false fullScreen=false level=0 | appActive=false frontmost=\"loginwindow\" keyWindow=\"<none>\"")
[462027] AUTO done
[462028] dump[auto-after-leave] main: Ok("title=\"Orasenda\" visible=false key=false main=false onActiveSpace=true occlusionVisible=false fullScreen=false level=0 | appActive=false frontmost=\"loginwindow\" keyWindow=\"<none>\"")
```

## How to decide them

### Option A (preferred): rerun the automation on an unlocked Mac

The scripts in Appendix B decide all three questions. Each one prints its log lines.

1. Unlock the Mac. Give the terminal that runs the scripts Accessibility access (System Settings › Privacy & Security › Accessibility) and Screen Recording access (for Q3's screenshots).
2. In a scratch worktree from `main`, apply Appendix A (`git apply`), then run `pnpm install` and `pnpm --filter orasenda tauri build --debug --bundles app`.
3. Save Appendix B's files into one folder. If the bundle is not at the default path, set `APP=<path to Orasenda.app>`.
4. Run `bash q1.sh`, `bash q2.sh` and `bash q3.sh`, one at a time, without touching the keyboard or mouse. Each run takes about 40 s. Keep a copy of `hs.log` after each run. Each script quits the app when it ends.
5. Read the logs with the rules under "Reading the logs" and paste the cited lines into this doc and into #450 and #457.

### Option B: owner by hand (no instrumentation; visible outcomes only)

Use today's `main` (`just dev`) for 1 and 2a and 2c. Steps 2b and 3 need the spike build (Appendix A), because `main` has no global full-screen shortcut, and opening the floater hides `main`.

1. **Key route.**
   1. In Today, press ⇧⌘T. The floater opens and `main` hides.
   2. Click a Finder window. The menu bar now says Finder.
   3. Click the floater's time once. It becomes key, and the menu bar still says Finder.
   4. Press ⌘K.
      - If `main` comes forward with the command palette open, the answer is **Menu**.
      - If nothing happens, or Finder's "Connect to Server" opens, the answer is **Monitor**.
   5. Repeat 1 and 3 to 4 with Orasenda active (skip step 2).
2. **Esc in full screen.**
   1. **(a)** In Today, choose View › Enter Full Screen (⌃⌘F), click the page once, and press Esc. Note whether the window leaves full screen.
   2. **(c)** Enter full screen again and press ⌘K. With the palette open, press Esc once and note what closes. Then press Esc again.
   3. **(b)** This needs the spike build. Switch to Finder and press ⌃⌥⌘F (the spike's *Everywhere* entry: show `main`, focus it, `set_fullscreen(true)`). Press Esc and note whether it leaves.
3. **Floater over full screen** (spike build). Press ⌃⌘F in `main`, then ⇧⌘T. Note whether the floater is visible over the full-screen Space. Then leave full screen, keep the floater open, and enter again. Note whether it is still visible.

## Reading the logs

Every line is `[ms] …`. Script steps are `### STEP:` lines. Here is what each prefix records:

- `NSEvent keyDown`: a local `NSEvent` monitor (log-only, never consumes). The event reached the app. Each line gives `event.window` (title, key, `onActiveSpace`, `fullScreen`) and `appActive` and `frontmost`.
- `MENU EVENT id=`: Tauri's menu handler ran (`lib.rs` `on_menu_event`).
- `WEBVIEW … capture|bubble keydown`: the page's `window` listeners. The capture line comes before React and the bubble line after it. `defaultPrevented=true` on the bubble line means the page (the palette, for example) handled the key.
- `POLL main.fullscreen=`: `is_fullscreen()`, polled every 100 ms and logged on change.
- `dump[...]`: an AppKit dump of a window (`isOnActiveSpace`, `occlusionState` visible bit, `styleMask` full-screen bit) and of the app.

These are the rules for each answer:

1. **Menu:** after `Q1.2a` (the floater is key and the app is inactive, so `appActive=false`), an `NSEvent keyDown keyCode=17 … event.window: title="Orasenda timer" key=true` line is followed by `MENU EVENT id=focus:floater`. The same must hold after `Q1.1` (the app is active).
   **Monitor:** the `NSEvent keyDown` line appears with no `MENU EVENT`, or no line appears at all.
2. Esc (`keyCode=53`):
   - The layer is the first of `NSEvent keyDown`, then `WEBVIEW capture`, then `WEBVIEW bubble`.
   - **AppKit leaves on its own** if `POLL main.fullscreen=Some(false)` follows Esc while the bubble line says `defaultPrevented=false`. Nothing in the app leaves full screen today, so any exit is AppKit's.
   - For (c): `defaultPrevented=true` on the bubble line with full screen kept means the palette got Esc first.
3. **Shows:** `dump[global-D] floater: … visible=true onActiveSpace=true occlusionVisible=true` while `dump[global-D] main: … fullScreen=true`. The screenshots `q3-*.png` confirm it.

## Draft: ADR-020's route line (H3a2 commits one)

This replaces the "A spike decides one route" sentence in ADR-020's Decision. Pick the line that the result supports and fill in the log lines.

- *If Menu:* "**Floater route: Menu** (HS, #446, `docs/spikes/2026-11-h-spikes.md`). App-menu key equivalents reach Orasenda while the non-activating floater is key, whether or not Orasenda is the active app (log: `<NSEvent keyDown … title=\"Orasenda timer\" … appActive=false>` then `<MENU EVENT id=focus:floater>`). The floater's webview binds no chord and no `NSEvent` monitor is installed (`KEY_ROUTE = Webview`), so ADR-016's 'never also bound in a webview' holds."
- *If Monitor:* "**Floater route: Monitor** (HS, #446, `docs/spikes/2026-11-h-spikes.md`). App-menu key equivalents don't reach Orasenda while the non-activating floater is key and Orasenda is inactive (log: `<NSEvent keyDown … appActive=false>` with no `MENU EVENT`). While the floater is key, the local `NSEvent` monitor in `crates/platform-macos` handles the registry's *In Orasenda* chords and calls `actions::run`, consuming the event so the menu can't fire it too. The webview binds no chord."

## Notes for H3a2 and H4a

- The spike's `hide_main` skips hiding while `main` is full screen. That is the behaviour H4 wants (the spec's floater toggle: "unless `main` is in full screen, which stays"). Today's `open_floater` hides `main` even in full screen, so Q3 can't be tested on `main` without the spike build.
- The Monitor route consumes the event, so the menu never sees it. With the app active, both the menu and a non-consuming monitor would fire. If Monitor wins, the monitor must consume, and the 300 ms de-dup in `actions::run` is only a backstop.

## Appendix A: instrumentation patch (throwaway; apply to a scratch worktree, never merge)

It changes `capabilities/{main,floater}.json`, adding `core:event:allow-emit` so the page can emit `hs-log`. This breaks `lib_tests/capabilities.rs`, which is fine for a throwaway build.

<details><summary>spike.patch</summary>

```diff
diff --git a/apps/orasenda/src-tauri/capabilities/floater.json b/apps/orasenda/src-tauri/capabilities/floater.json
index 3e6e5e1..e2b7587 100644
--- a/apps/orasenda/src-tauri/capabilities/floater.json
+++ b/apps/orasenda/src-tauri/capabilities/floater.json
@@ -2,7 +2,9 @@
   "$schema": "../gen/schemas/desktop-schema.json",
   "identifier": "floater",
   "description": "What the floating timer's webview may do: read the timer view, start, pause and resume, skip a break, drag itself, open its menu, close itself and bring Orasenda back.",
-  "windows": ["floater"],
+  "windows": [
+    "floater"
+  ],
   "permissions": [
     "core:event:allow-listen",
     "core:event:allow-unlisten",
@@ -16,6 +18,7 @@
     "allow-native-menu-popup",
     "allow-focus-view-close",
     "allow-main-show",
-    "allow-capture-open"
+    "allow-capture-open",
+    "core:event:allow-emit"
   ]
-}
+}
\ No newline at end of file
diff --git a/apps/orasenda/src-tauri/capabilities/main.json b/apps/orasenda/src-tauri/capabilities/main.json
index ed9bb99..f3fc4aa 100644
--- a/apps/orasenda/src-tauri/capabilities/main.json
+++ b/apps/orasenda/src-tauri/capabilities/main.json
@@ -2,7 +2,9 @@
   "$schema": "../gen/schemas/desktop-schema.json",
   "identifier": "main",
   "description": "What the main window's webview may do: call its app commands and listen to events.",
-  "windows": ["main"],
+  "windows": [
+    "main"
+  ],
   "permissions": [
     "core:event:allow-listen",
     "core:event:allow-unlisten",
@@ -47,6 +49,7 @@
     "allow-backups-restore",
     "allow-backups-set-policy",
     "allow-data-export",
-    "allow-data-import"
+    "allow-data-import",
+    "core:event:allow-emit"
   ]
-}
+}
\ No newline at end of file
diff --git a/apps/orasenda/src-tauri/src/hs_spike.rs b/apps/orasenda/src-tauri/src/hs_spike.rs
new file mode 100644
index 0000000..64e9788
--- /dev/null
+++ b/apps/orasenda/src-tauri/src/hs_spike.rs
@@ -0,0 +1,131 @@
+//! HS spike only (throwaway, never merged): logging to $HS_LOG.
+
+use std::io::Write;
+use std::time::{SystemTime, UNIX_EPOCH};
+
+use tauri::{AppHandle, Listener, Manager};
+
+pub(crate) fn log(msg: impl AsRef<str>) {
+    let Ok(path) = std::env::var("HS_LOG") else {
+        return;
+    };
+    let ms = SystemTime::now()
+        .duration_since(UNIX_EPOCH)
+        .map(|d| d.as_millis() % 1_000_000)
+        .unwrap_or(0);
+    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
+        let _ = writeln!(f, "[{ms:06}] {}", msg.as_ref());
+    }
+}
+
+/// Dumps the AppKit state of a window, on the main thread.
+pub(crate) fn dump(app: &AppHandle, label: &'static str, why: &'static str) {
+    let app2 = app.clone();
+    let _ = app.run_on_main_thread(move || {
+        let Some(w) = app2.get_webview_window(label) else {
+            log(format!("dump[{why}] {label}: no window"));
+            return;
+        };
+        let Ok(ptr) = w.ns_window() else { return };
+        // SAFETY: live window on the main thread.
+        let s = unsafe { orasenda_platform_macos::windows::hs_spike::window_state(ptr) };
+        log(format!("dump[{why}] {label}: {s:?}"));
+    });
+}
+
+thread_local! {
+    static MON: std::cell::RefCell<Option<orasenda_platform_macos::windows::KeyMonitor>> =
+        const { std::cell::RefCell::new(None) };
+}
+
+pub(crate) fn setup(app: &tauri::App) {
+    log("=== app setup ===");
+    app.listen_any("hs-log", |e| log(format!("WEBVIEW {}", e.payload())));
+    match orasenda_platform_macos::windows::hs_spike::install_key_logger(Box::new(|s| log(s))) {
+        Ok(m) => MON.with(|slot| *slot.borrow_mut() = Some(m)),
+        Err(e) => log(format!("key logger failed: {e}")),
+    }
+    // Poll full-screen and visibility changes.
+    let handle = app.handle().clone();
+    std::thread::spawn(move || {
+        let mut last = String::new();
+        loop {
+            std::thread::sleep(std::time::Duration::from_millis(100));
+            let main = handle.get_webview_window("main");
+            let fl = handle.get_webview_window("floater");
+            let now = format!(
+                "main.fullscreen={:?} main.visible={:?} main.focused={:?} floater.exists={} floater.visible={:?}",
+                main.as_ref().and_then(|w| w.is_fullscreen().ok()),
+                main.as_ref().and_then(|w| w.is_visible().ok()),
+                main.as_ref().and_then(|w| w.is_focused().ok()),
+                fl.is_some(),
+                fl.as_ref().and_then(|w| w.is_visible().ok()),
+            );
+            if now != last {
+                log(format!("POLL {now}"));
+                last = now;
+            }
+        }
+    });
+    // Spike globals: ⌃⌥⌘F = an "Everywhere" full-screen entry; ⌃⌥⌘T = open floater (key,
+    // no activation); ⌃⌥⌘D = dump state.
+    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
+    let gs = app.global_shortcut();
+    let r1 = gs.on_shortcut("Control+Alt+Super+KeyF", |app, _s, ev| {
+        if ev.state() != ShortcutState::Pressed {
+            return;
+        }
+        log("GLOBAL ⌃⌥⌘F pressed: show main, set_focus, set_fullscreen(true)");
+        if let Some(w) = app.get_webview_window("main") {
+            let _ = w.show();
+            let _ = w.set_focus();
+            let r = w.set_fullscreen(true);
+            log(format!("GLOBAL set_fullscreen -> {r:?}"));
+        }
+    });
+    let r2 = gs.on_shortcut("Control+Alt+Super+KeyT", |app, _s, ev| {
+        if ev.state() != ShortcutState::Pressed {
+            return;
+        }
+        log("GLOBAL ⌃⌥⌘T pressed: open_floater");
+        let app = app.clone();
+        tauri::async_runtime::spawn_blocking(move || {
+            let r = crate::windows::open_floater(&app).map_err(|e| e.message);
+            log(format!("GLOBAL open_floater -> {r:?}"));
+            std::thread::sleep(std::time::Duration::from_millis(300));
+            dump(&app, "floater", "after-global-open");
+        });
+    });
+    let r3 = gs.on_shortcut("Control+Alt+Super+KeyD", |app, _s, ev| {
+        if ev.state() != ShortcutState::Pressed {
+            return;
+        }
+        dump(app, "main", "global-D");
+        dump(app, "floater", "global-D");
+    });
+    log(format!("globals registered: {r1:?} {r2:?} {r3:?}"));
+    if std::env::var("HS_AUTO").as_deref() == Ok("1") {
+        let app = app.handle().clone();
+        std::thread::spawn(move || {
+            let s = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
+            s(3000);
+            dump(&app, "main", "auto-before-fs");
+            if let Some(w) = app.get_webview_window("main") {
+                log(format!("AUTO set_fullscreen(true) -> {:?}", w.set_fullscreen(true)));
+            }
+            s(4000);
+            dump(&app, "main", "auto-after-fs");
+            let r = crate::windows::open_floater(&app).map_err(|e| e.message);
+            log(format!("AUTO open_floater -> {r:?}"));
+            s(2000);
+            dump(&app, "floater", "auto-floater-over-fs");
+            dump(&app, "main", "auto-floater-over-fs");
+            if let Some(w) = app.get_webview_window("main") {
+                log(format!("AUTO set_fullscreen(false) -> {:?}", w.set_fullscreen(false)));
+            }
+            s(3000);
+            dump(&app, "main", "auto-after-leave");
+            log("AUTO done");
+        });
+    }
+}
diff --git a/apps/orasenda/src-tauri/src/lib.rs b/apps/orasenda/src-tauri/src/lib.rs
index d61e693..54ee449 100644
--- a/apps/orasenda/src-tauri/src/lib.rs
+++ b/apps/orasenda/src-tauri/src/lib.rs
@@ -123,6 +123,8 @@ fn export_bindings(builder: &tauri_specta::Builder<tauri::Wry>) -> Result<(), St
 /// `start_app` for iOS and the `Java_*` JNI bindings for Android. The Tauri CLI rejects a
 /// mobile library that lacks them. The macro also wraps `run` in `catch_unwind` and aborts on
 /// a panic, so a panic here kills the mobile process instead of unwinding into Java or Swift.
+mod hs_spike;
+
 #[cfg_attr(mobile, tauri::mobile_entry_point)]
 pub fn run() {
     let builder = specta_builder();
@@ -164,6 +166,7 @@ pub fn run() {
             tray::setup(app)?;
             runtime::ticker::spawn(runtime::ticker::AppHost::new(app.handle()))?;
             spike::setup(app)?;
+            hs_spike::setup(app);
             lifecycle::finish_launch(app.handle());
             // The first Focus menu and tray items, and the display observer.
             #[cfg(desktop)]
@@ -176,6 +179,8 @@ pub fn run() {
     let app = app.on_menu_event(|app, event| {
         use tauri::Manager;
         let id = event.id().as_ref();
+        hs_spike::log(format!("MENU EVENT id={id}"));
+        if id.starts_with("focus:") { hs_spike::dump(app, "floater", "menu-event"); }
         if !app.state::<commands::PopupSlot>().record(id) {
             #[cfg(target_os = "macos")]
             menu::on_menu_event(app, id);
diff --git a/apps/orasenda/src-tauri/src/windows/native.rs b/apps/orasenda/src-tauri/src/windows/native.rs
index d0ea4fa..3ab2714 100644
--- a/apps/orasenda/src-tauri/src/windows/native.rs
+++ b/apps/orasenda/src-tauri/src/windows/native.rs
@@ -379,7 +379,12 @@ mod mac {
         }
 
         fn hide_main(&self) -> Result<(), FocusViewError> {
-            self.window(MAIN)?.hide().map_err(tauri_error)
+            let w = self.window(MAIN)?;
+            if w.is_fullscreen().unwrap_or(false) {
+                crate::hs_spike::log("hide_main skipped: main is full screen (spike)");
+                return Ok(());
+            }
+            w.hide().map_err(tauri_error)
         }
 
         fn migrate_frames(&self, screens: &[Screen]) {
diff --git a/apps/orasenda/src/surfaces/floater/main.tsx b/apps/orasenda/src/surfaces/floater/main.tsx
index 7b48428..b6e1b61 100644
--- a/apps/orasenda/src/surfaces/floater/main.tsx
+++ b/apps/orasenda/src/surfaces/floater/main.tsx
@@ -15,3 +15,10 @@ createRoot(root).render(
     <FloaterPage />
   </StrictMode>,
 );
+
+import { emit as __hsEmit } from "@tauri-apps/api/event";
+for (const phase of [true, false]) {
+  window.addEventListener("keydown", (e) => {
+    void __hsEmit("hs-log", `${document.title || location.pathname} ${phase ? "capture" : "bubble"} keydown key=${e.key} meta=${e.metaKey} shift=${e.shiftKey} ctrl=${e.ctrlKey} alt=${e.altKey} defaultPrevented=${e.defaultPrevented} target=${(e.target as HTMLElement)?.tagName} dialogs=${document.querySelectorAll('[role="dialog"]').length}`);
+  }, phase);
+}
diff --git a/apps/orasenda/src/surfaces/main/main.tsx b/apps/orasenda/src/surfaces/main/main.tsx
index fb1b3ad..31d25b6 100644
--- a/apps/orasenda/src/surfaces/main/main.tsx
+++ b/apps/orasenda/src/surfaces/main/main.tsx
@@ -15,3 +15,10 @@ createRoot(root).render(
     <App />
   </StrictMode>,
 );
+
+import { emit as __hsEmit } from "@tauri-apps/api/event";
+for (const phase of [true, false]) {
+  window.addEventListener("keydown", (e) => {
+    void __hsEmit("hs-log", `${document.title || location.pathname} ${phase ? "capture" : "bubble"} keydown key=${e.key} meta=${e.metaKey} shift=${e.shiftKey} ctrl=${e.ctrlKey} alt=${e.altKey} defaultPrevented=${e.defaultPrevented} target=${(e.target as HTMLElement)?.tagName} dialogs=${document.querySelectorAll('[role="dialog"]').length}`);
+  }, phase);
+}
diff --git a/crates/platform-macos/src/windows/hs_spike.rs b/crates/platform-macos/src/windows/hs_spike.rs
new file mode 100644
index 0000000..8872b5c
--- /dev/null
+++ b/crates/platform-macos/src/windows/hs_spike.rs
@@ -0,0 +1,83 @@
+//! HS spike only (throwaway, never merged): log-only key monitor and window/app state dumps.
+
+use std::ffi::c_void;
+use std::ptr::NonNull;
+
+use block2::RcBlock;
+use objc2::MainThreadMarker;
+use objc2_app_kit::{
+    NSApplication, NSEvent, NSEventMask, NSWindow, NSWindowOcclusionState, NSWindowStyleMask,
+    NSWorkspace,
+};
+
+use super::{KeyMonitor, WindowError, main_thread, window};
+
+fn app_state(mtm: MainThreadMarker) -> String {
+    let app = NSApplication::sharedApplication(mtm);
+    let front = NSWorkspace::sharedWorkspace()
+        .frontmostApplication()
+        .and_then(|a| a.localizedName())
+        .map(|n| n.to_string())
+        .unwrap_or_default();
+    let key = app
+        .keyWindow()
+        .map(|w| w.title().to_string())
+        .unwrap_or_else(|| "<none>".into());
+    format!("appActive={} frontmost={front:?} keyWindow={key:?}", app.isActive())
+}
+
+fn describe(w: &NSWindow) -> String {
+    format!(
+        "title={:?} visible={} key={} main={} onActiveSpace={} occlusionVisible={} fullScreen={} level={}",
+        w.title().to_string(),
+        w.isVisible(),
+        w.isKeyWindow(),
+        w.isMainWindow(),
+        w.isOnActiveSpace(),
+        w.occlusionState().contains(NSWindowOcclusionState::Visible),
+        w.styleMask().contains(NSWindowStyleMask::FullScreen),
+        w.level(),
+    )
+}
+
+/// Installs a local key-down monitor that logs every key event and passes it on unchanged.
+pub fn install_key_logger(log: Box<dyn Fn(String)>) -> Result<KeyMonitor, WindowError> {
+    let mtm = main_thread()?;
+    let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
+        // SAFETY: AppKit passes a live event for the duration of the handler.
+        let e = unsafe { event.as_ref() };
+        let chars = e
+            .charactersIgnoringModifiers()
+            .map(|s| s.to_string())
+            .unwrap_or_default();
+        let win = e
+            .window(mtm)
+            .map(|w| describe(&w))
+            .unwrap_or_else(|| "<no window>".into());
+        log(format!(
+            "NSEvent keyDown keyCode={} chars={chars:?} flags={:#x} repeat={} | event.window: {win} | {}",
+            e.keyCode(),
+            e.modifierFlags().0,
+            e.isARepeat(),
+            app_state(mtm)
+        ));
+        event.as_ptr()
+    });
+    // SAFETY: the block is copied by AppKit; the monitor object is kept until removed.
+    let monitor = unsafe {
+        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block)
+    }
+    .ok_or(WindowError::NullWindow)?;
+    Ok(KeyMonitor::new(monitor))
+}
+
+/// A one-line dump of a window and the app.
+///
+/// # Safety
+///
+/// `ns_window` must be null or a live `NSWindow`.
+pub unsafe fn window_state(ns_window: *mut c_void) -> Result<String, WindowError> {
+    let mtm = main_thread()?;
+    let w = window(ns_window)?;
+    Ok(format!("{} | {}", describe(w), app_state(mtm)))
+}
diff --git a/crates/platform-macos/src/windows/keys.rs b/crates/platform-macos/src/windows/keys.rs
index 121f8b7..c7f2867 100644
--- a/crates/platform-macos/src/windows/keys.rs
+++ b/crates/platform-macos/src/windows/keys.rs
@@ -77,6 +77,12 @@ pub fn floater_key(key_code: u16, modifiers: Modifiers) -> Option<FloaterKey> {
 #[must_use = "dropping it unregisters the observer"]
 pub struct KeyMonitor(Retained<AnyObject>);
 
+impl KeyMonitor {
+    pub(crate) fn new(o: Retained<AnyObject>) -> Self {
+        Self(o)
+    }
+}
+
 impl Drop for KeyMonitor {
     fn drop(&mut self) {
         // SAFETY: the object came from `addLocalMonitorForEventsMatchingMask:handler:`.
diff --git a/crates/platform-macos/src/windows/mod.rs b/crates/platform-macos/src/windows/mod.rs
index b69a6d6..594f5d5 100644
--- a/crates/platform-macos/src/windows/mod.rs
+++ b/crates/platform-macos/src/windows/mod.rs
@@ -26,6 +26,7 @@ mod displays;
 mod floater;
 mod focus_window;
 mod keys;
+pub mod hs_spike;
 #[cfg(test)]
 mod tests;
 
```

</details>

## Appendix B: scripts

<details><summary>lib.sh</summary>

```bash
HS=$(builtin cd "$(dirname "$0")" && pwd)
APP=${APP:-/Users/arnoldgandarillas/Projects/Veloud/orasenda/.worktrees/.cargo-target-446/debug/bundle/macos/Orasenda.app}
LOG=$HS/hs.log
d() { osascript -e "delay $1"; }
mark() { echo "[------] ### STEP: $*" >> $LOG; }
key() { osascript -e "tell application \"System Events\" to $1" 2>&1; }
front() { osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'; }
launch() { pkill -x orasenda; d 1; : > $LOG; open -n --env HS_LOG=$LOG "$APP"; d 6; mark "launched, frontmost=$(front)"; }
orafront() { key 'set frontmost of process "Orasenda" to true'; d 1; mark "Orasenda frontmost requested, frontmost=$(front)"; }
finder() { osascript -e 'tell application "Finder" to activate'; d 1; mark "Finder activated, frontmost=$(front)"; }
quit() { pkill -x orasenda; }
# Never type into the lock screen: stop if the session is locked.
if ioreg -n Root -d1 -a | grep -A1 CGSSessionScreenIsLocked | grep -q '<true/>'; then
  echo "screen is locked: unlock the Mac first" >&2; exit 1
fi
```

</details>

<details><summary>q1.sh (key route)</summary>

```bash
. "$(dirname "$0")/lib.sh"
launch
orafront
mark "Q1.0 send shift-cmd-T with main key (opens floater)"
key 'keystroke "t" using {shift down, command down}'; d 2
mark "Q1.1 floater key, Orasenda frontmost=$(front): send shift-cmd-T"
key 'keystroke "t" using {shift down, command down}'; d 2
mark "Q1.1b send cmd-K (palette)"
key 'keystroke "k" using {command down}'; d 2
finder
mark "Q1.2 global ctrl-opt-cmd-T to make floater key without activation"
key 'keystroke "t" using {control down, option down, command down}'; d 2
mark "Q1.2a frontmost=$(front); send shift-cmd-T"
key 'keystroke "t" using {shift down, command down}'; d 2
mark "Q1.2b send space (webview control)"
key 'keystroke " "'; d 1
key 'keystroke " "'; d 1
mark "Q1.2c global dump"
key 'keystroke "d" using {control down, option down, command down}'; d 1
mark "Q1.2d send cmd-K"
key 'keystroke "k" using {command down}'; d 2
mark "end frontmost=$(front)"
quit
```

</details>

<details><summary>q2.sh (Esc in full screen)</summary>

```bash
. "$(dirname "$0")/lib.sh"
launch
orafront
mark "Q2a enter full screen via View > Enter Full Screen (app_menu.rs:86 default menu)"
key 'click menu item "Enter Full Screen" of menu "View" of menu bar 1 of process "Orasenda"'; d 4
mark "Q2a Esc with the webview focused"
key 'key code 53'; d 3
mark "Q2a done; leave if still full screen"
key 'click menu item "Exit Full Screen" of menu "View" of menu bar 1 of process "Orasenda"'; d 3
finder
mark "Q2b Everywhere entry from Finder: global ctrl-opt-cmd-F"
key 'keystroke "f" using {control down, option down, command down}'; d 4
mark "Q2b frontmost=$(front); Esc"
key 'key code 53'; d 3
key 'keystroke "d" using {control down, option down, command down}'; d 1
mark "Q2c ensure full screen (global), open palette cmd-K, Esc, Esc"
key 'keystroke "f" using {control down, option down, command down}'; d 4
key 'keystroke "k" using {command down}'; d 2
mark "Q2c Esc #1 (palette open)"
key 'key code 53'; d 3
mark "Q2c Esc #2 (no overlay)"
key 'key code 53'; d 3
mark "end frontmost=$(front)"
quit
```

</details>

<details><summary>q3.sh (floater over full screen)</summary>

```bash
. "$(dirname "$0")/lib.sh"
launch
orafront
mark "Q3.1 enter full screen with ctrl-cmd-F, then shift-cmd-T opens the floater over it"
key 'keystroke "f" using {control down, command down}'; d 4
key 'keystroke "t" using {shift down, command down}'; d 2
key 'keystroke "d" using {control down, option down, command down}'; d 1
screencapture -x "$HS/q3-floater-over-fs.png"
mark "Q3.2 leave (menu) and re-enter with the floater already open"
key 'click menu item "Exit Full Screen" of menu "View" of menu bar 1 of process "Orasenda"'; d 3
key 'set frontmost of process "Orasenda" to true'; d 1
key 'keystroke "f" using {control down, command down}'; d 4
key 'keystroke "d" using {control down, option down, command down}'; d 1
screencapture -x "$HS/q3-fs-with-floater-open.png"
mark "end"
quit
```

</details>
