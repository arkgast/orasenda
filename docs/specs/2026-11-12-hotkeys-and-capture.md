# Hotkeys and capture (P1 sub-project F) — Spec

- Status: approved (owner, 2026-11-12)
- Date: 2026-11-12
- Owner: Arnold Gandarillas Castillo
- Related:
  - Plan and context: [ROADMAP row F](../ROADMAP.md#p1-sub-projects) (`docs/ROADMAP.md:50`); SPEC capture and Inbox (`docs/SPEC.md:42,56,66`).
  - Redesign brief: §2.2 global start path (`design/reviews/04-redesign-pass/01-brief.md:160-176`), §3.12 Settings › Keyboard (`:363-366`), §3.13 Capture pad (`:550-564`) and §3.15 Onboarding (`:585-589`).
  - Reviews: critique F2, F6 and F10 (`02-brief-critique.md:44-50,76-82,106-112`); review-b-settings (`b-settings-3`, `-6`, `-7`); review-e-onboarding (`e-onboarding-3`, `-4`, `-13`).
  - Components: `CapturePad`, `ShortcutRecorder`, `InlineNotice` (the tip and welcome rows, `inline-notice.md:24-25,47-48`), `SettingsRow` and `EmptyState`.
  - ADRs: ADR-012, ADR-013, ADR-014 and ADR-016; proposes ADR-017 (this spec).
  - Earlier specs: [spec D](2026-11-12-focus-views.md) (the floater panel class swap) and [the polish spec](2026-11-12-today-timer-polish.md) (the keep-going hint and the `meta` flag pattern).
  - #326 (VoiceOver at the end of P1).

## TL;DR
- **Two global shortcuts** registered once in Rust through `tauri-plugin-global-shortcut` 2.4.1 (owner, 2026-11-12):
  - **⌃⌥F** starts the selected preset when idle, or pauses or resumes when a session runs. It never opens a window.
  - **⌃⌥N** opens the capture panel.
  - Both can be changed or turned off in **Settings › Keyboard**.
  - If a shortcut fails to register, it drops its menu-bar text and shows "Another app uses this shortcut. Pick a different one." Nothing else nags.
- **The capture panel** is a key-capable, non-activating panel (D3's class swap; owner, 2026-11-12). It appears over the current app, full-screen apps included, takes typing without bringing Orasenda forward, and saves to the Inbox with `CapturePad`.
- **The Inbox** is a new syncable `inbox_note` table (migration 0005, change_log like `preset`; owner, 2026-11-12). **Board** shows it as a plain list, newest first, with Remove and Undo (owner, 2026-11-12).
- **Single-key shortcuts** cover Space, F and P on Today, and Space in the Focus window. A checkbox in Settings › Keyboard turns them off (WCAG 2.1.4), and it is on by default.
- **Welcome and tips:**
  - "Welcome. Nothing to set up." shows on a true first run.
  - Two one-time tips, after the first and the second session end, about the global shortcut and the Focus view. Their "seen" state is device-only `meta` flags.

## Change in a nutshell
Keynote is playing full screen, and Orasenda is idle with Steady Focus selected.
1. Press **⌃⌥F**. Nothing appears, but the menu-bar timer starts counting 25:00. Press ⌃⌥F again and it pauses.
2. A thought comes up. Press **⌃⌥N**. A small panel appears over Keynote, on the same Space and on the display under the pointer:

```
 ┌─────────────────────────────────────────┐
 │ Capture a thought                        │
 │ ┌─────────────────────────────────────┐ │
 │ │ call the dentist|                    │ │
 │ └─────────────────────────────────────┘ │
 │ (•) From my own mind  ( ) From around me │
 │ Esc saves to Inbox and closes. ⌘↩ saves too.│
 │                         [ Save to Inbox ] │
 └─────────────────────────────────────────┘
```

3. Type, then press Esc. The panel closes, VoiceOver hears "Saved to Inbox.", and Keynote is still frontmost and full screen.
4. Later, open **Board**. It shows:

```
 Inbox
 call the dentist           Internal · 14:32   [Remove]
```

In general, the global shortcuts are Rust-owned and registered once. The capture panel is one more ADR-016 window with its own entry and capability file. Notes are syncable rows that later become the first Kanban column.

## Problem
Orasenda can only be started from its own windows or the menu bar. Starting focus costs a context switch, and so does writing down a stray thought, which is the thing focus is meant to protect. SPEC promises a capture pad and a global start (`docs/SPEC.md:42,66`). The brief designed both, and Components built `CapturePad` and `ShortcutRecorder`. Nothing on main registers a global shortcut, stores a note or shows the components (checked 2026-11-12, `6715b71`):
- no global-shortcut crate in any `Cargo.toml`;
- no `keys.*` setting (`crates/service/src/session/settings.rs:22-30`);
- no note table (the migrations stop at `0004_window_frame.sql`, `SCHEMA_VERSION = 4`, `crates/store/src/lib.rs:35`);
- no single-key handler on Today or the Focus page; the floater handles only its own Space, Return and Esc (`features/floater/FloaterPage.tsx:63-69`).

## Goals / Success criteria
1. With ⌃⌥F registered:
   - one press starts the selected preset when idle or ended;
   - it pauses a running focus or break and resumes a paused one;
   - one press while Orasenda is frontmost acts exactly once. ⌃⌥F exists only as the global registration: there is no webview handler and no live menu accelerator for it, so nothing else can fire;
   - it opens no window.
2. ⌃⌥N opens the capture panel on the display under the pointer (`NSEvent.mouseLocation`; no Screen Recording permission is needed) *(author's call)*:
   - in front of a full-screen app, on that app's Space;
   - the previous app stays active, and the keyboard goes to the panel;
   - pressing it while the panel is open focuses the panel's text.
3. A failed registration, at launch or on change:
   - leaves that shortcut unregistered;
   - drops its text from the menu-bar item;
   - shows "Another app uses this shortcut. Pick a different one." on its Settings row;
   - shows no other message anywhere.
4. Settings › Keyboard records, changes, turns off and restores each global shortcut. A change is saved only after the new shortcut registers, so the old one keeps working until then.
5. With *Single-key shortcuts* off:
   - Space, F and P on Today and Space in the Focus window do nothing;
   - captions, tooltips and `aria-keyshortcuts` stop naming them;
   - every ⌘ combination and both global shortcuts still work.
6. Saving a capture writes one `inbox_note` row and its change_log rows in one transaction. A failed save keeps the text in the panel with "Your note is still here. Try saving again."
7. Board lists live notes newest first. Remove hides a note at once and offers Undo. A note saved from the panel appears on an open Board without a reload.
8. The welcome line shows only on a true first run. Each tip shows at most twice and never again once seen. All of them follow the InlineNotice contract (≤ 65 characters, the status row's ranking).

## Non-goals
- Kanban, editing a note, moving a note out of the Inbox, and purging tombstones. Those are the board sub-project's.
- T on Calendar and M in app lists. Those pages don't exist yet; their single keys come with them and honour the same setting.
- Detecting which other app holds a shortcut. macOS doesn't say.
- VoiceOver passes (#326). The code still sets names, roles and announcements.
- Windows and mobile registration. The plugin is desktop-only; `just mobile` must still build (`#[cfg(desktop)]`).
- Screenshots. The owner checks visuals by eye.

## Users & permissions
A single local user. No roles. The capture window's capability grants only `capture_note`, `settings_get`, `capture_close` and the plugin-free events it listens to. It doesn't grant the global-shortcut plugin, which only Rust uses. `main` gets the Inbox and keyboard commands.

| Window | Can | Cannot |
|---|---|---|
| `main` | read and change keyboard settings; list, remove and restore notes; open the capture panel | register shortcuts from JS (ADR-014 option 3 was rejected) |
| `capture` | save a note, close itself, read settings | read or remove notes, change settings, control the timer |
| `focus-*`, `floater` | unchanged, plus `capture_open` (⌘K is main-only; the menu items are Rust) | anything new beyond that |

## Tenancy & localization
n/a for tenancy. Times on Board use the device's local time zone through the existing Rust clock formatting: "14:32" for today, "Yesterday 14:32", and otherwise "12 Nov 14:32" *(author's call)*. The copy is English only.

## Domain model
- **Global shortcut:** one of `startPause` (default "Control+Alt+KeyF") or `capture` (default "Control+Alt+KeyN"). It is stored as a syncable setting: `keys.start_pause` and `keys.capture`, whose value is a canonical accelerator string or `"off"`. Canonical form: modifiers in the order Control, Alt, Shift, Super, then the `KeyboardEvent.code`, joined by `+`. Rust parses it into the plugin's `Shortcut`; `describeShortcut` renders it as "⌃⌥F".
- **Registration status** (Rust, in memory): `registered | off | failed` per shortcut. It is computed at launch and after each change, and never stored.
- **Single-key setting:** `keys.single_key` (bool, default true, syncable).
- **Inbox note** (`inbox_note`, **syncable**, ADR-012):
  - `id` is a UUIDv7;
  - `text` is 1–1000 characters after trimming;
  - `kind` is `internal | external`;
  - `created_at` is ms UTC;
  - `deleted_at` is ms UTC or NULL (the tombstone).
  - Every field write logs change_log with entity `inbox_note`.
  - Lifecycle: live → removed (`deleted_at` set) → live again on Undo (`deleted_at` NULL). It is never hard-deleted in F.
- **Onboarding flags** (device-only `meta`, as in the polish spec): `onboard.welcome_done`, `tip.global_shortcut` and `tip.focus_view`. The value is `"seen"` or a show count (`"1"`). **Use flags:** `used.global_shortcut` (set by Rust on the first ⌃⌥F press) and `used.focus_view` (set on the first Focus window or floater open). Setting one also marks its tip seen.
- **Terms** added to CONTEXT.md: global shortcut, registration status, single-key shortcut, capture panel, Inbox note, tip.

## Interfaces

### Rust service and IPC
- **Settings:** `Settings` gains `startPauseKeys: string`, `captureKeys: string` and `singleKey: boolean`.
  - A shortcut changes only through `keyboard_set_shortcut(id: ShortcutId, keys: string | null) -> Result<KeyboardView, KeyboardError>`; `null` means off.
  - The order is: parse → refuse a clash with the other global shortcut or with an app menu accelerator (`KeyboardError::InUseByOrasenda`) → register the new one → only then save the setting and unregister the old one.
  - If registering fails, the result is `KeyboardError::Unavailable`: nothing is saved and the old shortcut stays registered.
  - `keyboard_restore_default(id)` uses the same path.
  - `singleKey` saves through the existing single-field settings chain (ADR-014).
- `keyboard_state() -> KeyboardView { startPause: ShortcutView, capture: ShortcutView, singleKey: bool, voiceOver: bool }`, where `ShortcutView { keys: string | null, status: "registered" | "off" | "failed" }`. The event `keyboard-changed` carries a `KeyboardView`. `voiceOver` is read from `NSWorkspace.isVoiceOverEnabled` in `crates/platform-macos` and updated on the workspace accessibility notification.
- **⌃⌥F handler** (Rust, on press only):
  - idle or ended → `timer_start` with the selected preset;
  - running → pause;
  - paused → resume;
  - in a break → pause or resume the break.

  It is the same service path as the menu items, so an Orasenda window being key doesn't matter.
- **Capture:**
  - `capture_open()` opens or focuses the panel.
  - `capture_note({ text, kind }) -> Result<NoteView, CaptureError>`; `CaptureError` is `Empty | TooLong | Store`.
  - `capture_close()` closes the panel.
  - `inbox_list() -> Vec<NoteView>` (live notes, newest first);
  - `inbox_remove(id) -> Result<(), InboxError>`;
  - `inbox_restore(id) -> Result<(), InboxError>`;
  - the event `inbox-changed` carries the list.
  - `NoteView { id, text, kind, createdAt: string /* "14:32" */, createdAtLabel: string /* spoken */ }`.
- **Tips:** `TimerView` gains `tip: "globalShortcut" | "globalShortcutMenu" | "focusView" | "focusViewKeys" | null` and `welcome: boolean`. `tip_seen(tip: TipId, how: "gotIt" | "shown")` updates `meta`.
- **Menu bar:** the tray's start item shows the shortcut as inert text appended to its title after two spaces ("Start focus · 25 min  ⌃⌥F"; Tauri has no non-live accelerator, so padding to a right edge is not attempted) *(author's call)*, never as a live accelerator, and with no text when it is off or failed (critique F10). A new item, "Capture a thought…", shows ⌃⌥N the same way and calls `capture_open`.
- ⌘K gains the command "Capture a thought" → `capture_open`.

### Capture panel window (ADR-016 line)
- Label `capture`, HTML entry `capture.html`, capability `capture.json`.
- A key-capable `NSPanel` through D3's class swap: `nonactivatingPanel`, `NSFloatingWindowLevel`, `canJoinAllSpaces | fullScreenAuxiliary | transient | ignoresCycle`, `hidesOnDeactivate` off.
- `panel-width` (420px) × auto height, centred horizontally, in the upper third of the target display's visible frame *(author's call)*. No frame memory.
- Its content is `CapturePad`, with the host doing the following:
  - `onSave` → `capture_note`. On success the host posts an accessibility announcement "Saved to Inbox." through `platform-macos`, then closes the panel. On failure it rejects, so the pad shows its own error line.
  - `onClose` → `capture_close`.
  - The kind starts at Internal each time *(author's call)*.
- Opening it while a modal dialog is open in `main` still works, because it is its own window.

### Settings › Keyboard (main)
A new section, `keyboard`, between Notifications and Apps and sites (brief §3.12). It has these rows (SettingsRow):
1. *Start or pause focus*: a `ShortcutRecorder`, with Restore default.
2. *Capture a thought*: the same.
3. Each recorder row's error line:
   - "Another app uses this shortcut. Pick a different one." on `failed` or `Unavailable`;
   - "Orasenda already uses this shortcut. Pick a different one." on `InUseByOrasenda` *(author's call)*;
   - "VoiceOver uses Control-Option keys. You may want a different shortcut." while `voiceOver` and the keys include ⌃⌥.
4. *Single-key shortcuts*: a checkbox with the helper "Space, F and P on Today, Space in Focus view. Shortcuts with ⌘ always work." *(author's call, adapting b-settings-7)*.
5. *All shortcuts*: a read-only table (the new component `ShortcutList`: action and `Kbd`), listing:
   - ⌘↩ Start focus; ⌘⇧↩ Just 2 minutes; ⌘. End session;
   - ⇧⌘F Full screen; ⇧⌘T Floating timer; ⌘K Commands; ⌘, Settings;
   - Space, F and P on Today; Space in Focus view (marked "Off" when single keys are off).

The save line confirms each change: "Start or pause focus: ⌃⌥G." (b-settings-6). `SettingsTarget` gains `"keyboard"`.

### Single keys
- **Today:** while focus is on the page body or heading, not on a control or field (spec C's rule):
  - Space starts, pauses or resumes;
  - F opens the Focus view menu;
  - P opens the preset popover.
- **Focus window:** Space starts, pauses or resumes.
- All of them honour `singleKey`, which also drives StartButton's and FullScreenFocus's `singleKeys` props and the tooltips ("Change preset · P", direction pick).
- The floater's Space, Return and Esc act only while the floater has focus. It is a tiny surface whose keys are its controls, so it is exempt under 2.1.4's "active only on focus" clause, and it ignores the setting *(author's call)*.

### Board (main)
- `PageFrame` with the heading "Inbox".
- Rows (the new component `InboxRow`): the text (wraps, never truncated), then "Internal" or "External" · time, and an `IconButton` Remove (name "Remove note: <first 40 characters>").
- Remove shows the status line "Note removed." with Undo, until the next removal or 10 s *(author's call; same pattern as preset remove in E)*.
- Empty: `EmptyState` "Nothing in your Inbox." with "⌃⌥N captures a thought from anywhere." (or "Capture a thought from the menu bar." when that shortcut is off or failed).
- The page scrolls inside `ScrollRegion` (Board is not a no-scroll page).

### Welcome and tips (Today's status row)
| Line | When | Gone |
|---|---|---|
| "Welcome. Nothing to set up." | `onboard.welcome_done` is absent **and** there are no `focus_session` rows | at first Start (sets the flag) |
| "Tip: ⌃⌥F starts or pauses focus from anywhere." (the user's keys; spoken "Control-Option-F …") + Got it | after the 1st session end; `startPause` is `registered` and VoiceOver is off; ⌃⌥F was never used | Got it, a use of ⌃⌥F, or the 2nd showing |
| "Tip: The menu bar item starts focus from anywhere." + Got it | the same, when the shortcut is off, failed, or VoiceOver is on | the same |
| "Tip: F key opens Focus view, full screen or floating." + Got it | after the 2nd session end; single keys on; Focus view never opened | Got it, opening any Focus view, or the 2nd showing |
| "Tip: ⇧⌘F opens full screen, ⇧⌘T the floating timer." + Got it | the same, with single keys off | the same |

Tips follow the InlineNotice rules:
- only when Today is idle and the row is otherwise empty, or joined to "Session ended.";
- Got it removes only the tip (e-onboarding-13);
- none while the store can't write;
- never marked seen on Start (e-onboarding-4).

## Behavior & edge cases
- **Clashes:** ⌃⌥F pressed while a ⌘. or Start is in flight goes through the same newest-wins service lock, so it never double-starts. Recording the other global shortcut's keys gives `InUseByOrasenda`.
- **Launch:** Rust registers the saved shortcuts after the store opens. If that fails, the status is `failed` and is shown on the next Settings open and in the tray. There is no notification.
- **Shortcut changed on another device (sync, later):** sync writes the setting directly, as it does for every key, so no bypass of the save path is needed. Rust then tries to register it. On failure the status is `failed` in memory, the synced value is kept, and the previous one is unregistered, because it belonged to the other device's choice *(author's call)*.
- **Capture panel lifetime:** it closes only through the pad, either by saving or by Esc on an empty pad. After a failed save, Esc tries to save again and never discards (the CapturePad contract). Clicking another app leaves the panel in place, above it, until it is saved or closed.
- **Keyboard in the panel:** D3's floater already takes key events as a non-activating key panel. Typing, IME composition and VoiceOver focus in a text area of such a panel are not yet proven. The plan's capture window task starts with that check (a test page in the real panel) and stops for a ruling if it fails.
- **Welcome per device:** "true first run" means this device's `meta` flag is absent and the local store has no `focus_session` rows. A synced history (later) therefore suppresses it.
- **Capture while the store is unavailable:** Save rejects (`Store`), the text stays, and nothing is announced.
- **Text:** whitespace-only text can't be saved (the pad disables Save). Over 1000 characters gives `TooLong`, shown as "This note is too long to save. Shorten it a little." *(author's call)*. Inner newlines are kept.
- **Removed note restored after a sync tombstone:** n/a until sync. Restore clears `deleted_at` and logs change_log.
- **VoiceOver on:** ⌃⌥ keys don't reach Orasenda. The Settings row says so, and the tray item and ⌘↩ still work (brief §2.2).
- **Reduce motion:** the panel appears and disappears with no animation.

## Data & migrations
- `0005_inbox_note.sql`:
  - `inbox_note(id TEXT PRIMARY KEY, text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 1000), kind TEXT NOT NULL CHECK(kind IN ('internal','external')), created_at INTEGER NOT NULL, deleted_at INTEGER)`;
  - an index on `(deleted_at, created_at DESC)`.
  - `SCHEMA_VERSION` becomes 5, and the fresh-schema table count increases by one.
- New setting keys with defaults (no migration, as settings are key-value): `keys.start_pause`, `keys.capture`, `keys.single_key`.
- New `meta` keys (device-only, no migration).

## Testing strategy
- **Rust:**
  - parse/describe round-trip for accelerators; register-before-save (a failed register saves nothing and keeps the old one);
  - `InUseByOrasenda`;
  - ⌃⌥F in each state (idle, running, paused, break, ended), and once only;
  - the launch failure status; tray text (inert, removed on off or failed);
  - `capture_note` validation and transaction (row + change_log);
  - list order, remove and restore with change_log;
  - tip and welcome derivation from session counts, use flags, shortcut status and VoiceOver;
  - capability exact-list tests for `main`, `capture`, `focus` and `floater`; a capture window spec test.
  - The plugin is behind a `ShortcutRegistrar` trait so the service is tested with a fake that can fail.
- **Webview (vitest):**
  - Settings › Keyboard rows, error lines, the save line and restore default;
  - single keys on and off (Today Space, F and P; Focus Space; ignored in fields and on controls);
  - the capture host (save → announce → close; failure keeps text);
  - Board list, remove and Undo, live update and empty states;
  - tip and welcome lines and Got it.
- **Layout (Playwright WebKit):**
  - `capture.html` at `panel-width`: every state, 44px targets, no overflow;
  - Settings › Keyboard at the Settings size set;
  - Board with 0, 1 and 50 notes at Today's size set (it scrolls, and the targets are 44px);
  - Today with the longest tip at 360×240 (row stays 44px).
- **Hands-on (owner):**
  - ⌃⌥F and ⌃⌥N from another app, with Orasenda frontmost, and with another app holding ⌃⌥F (for example a second app registering it);
  - VoiceOver on and off;
  - the capture panel over a full-screen app;
  - visuals in both themes.

## Decisions
- **Owner, 2026-11-12:**
  - the official plugin over our own Carbon wrapper;
  - a non-activating panel over a normal window;
  - a syncable `inbox_note` table over a device-only one;
  - the Inbox list on Board over a new page or save-only.
- **ADR-017 "Global shortcuts"** (new, proposed here):
  - registered once in Rust through `tauri-plugin-global-shortcut`, behind a `ShortcutRegistrar` trait;
  - register before saving;
  - never a live tray accelerator;
  - single keys are per surface and honour `keys.single_key`.

  Later sub-projects (Calendar's T, Windows) follow it.
- **ADR-016** gains the `capture` window line.
- CONTEXT.md gains the terms listed under Domain model.

## FAQ
### Why register before saving rather than save then register?
ADR-014 applies side effects after a commit, which would leave a saved shortcut that doesn't work and the old one gone. Registering first keeps a working shortcut at every moment. The setting is only written once registration has succeeded, so the "side effect after the commit" rule still holds for unregistering the old one.

### Why do tips live on `TimerView`?
Rust knows every input: session counts, whether ⌃⌥F was used, whether a Focus view opened, shortcut status and VoiceOver. Today renders and reports "Got it" or "shown", as with the keep-going hint.

### Why can't the capture panel read the Inbox?
It only writes. Keeping its capability to four commands follows ADR-016's "only the commands it uses".

## Open questions
None.

## Implementation status
- Plan: [docs/plans/2026-11-12-hotkeys-and-capture.md](../plans/2026-11-12-hotkeys-and-capture.md)
- [ ] F1 (#386)
- [ ] F2 (#387)
- [ ] F3 (#389)
- [ ] F4 (#388)
- [ ] F5 (#390)
- [ ] F6 (#392)
- [ ] F7 (#393)
- [ ] F8 (#391)
- [ ] F9 (#394)
- [ ] F10 (#395)
