# Critique of the design brief (phase 1)

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Input: `01-brief.md`, checked against `docs/SPEC.md` §1–3, `docs/ROADMAP.md`, ADR-004/005/013, spec A, the design system (`README.md`, `tokens.json`, component READMEs, `bundle.js`, `bundle.css`), `design/reviews/03-final-notes.md`, `apps/orasenda/src/**`, `src-tauri/src/{session,scheduler,ipc,tray}.rs`, `tauri.conf.json`.

## Verdict: approve with changes

The brief answers all five owner directions, respects the decided items, fixes the known issue by construction (viewport-bounded grid, fluid ring, fixed controls row, reserved status slot) and gives "start focus" one action or one keystroke from six places. The audit's code claims are accurate: I verified every citation that carries weight (T3, T5, T6, T8, M1, M4, D2, D5, the layout arithmetic). The role-plus-privacy model for apps is the right rethink.

The changes below are needed before phase 2. One is a blocker because the full-screen plan relies on a macOS behaviour that breaks in a common configuration; the rest are majors that would otherwise be carried into mock-ups and the design system.

---

## 1. Audit verification

| Claim | Checked | Result |
|---|---|---|
| T3 request on first Start, default on | `session.rs:504-507`, `ipc.rs:132` | Correct. `request_notifications` is set on every start while `NotDetermined`; `notify_session_end: true`. |
| T5 timer not centred | `app.css:76-82` | Correct: `align-items: flex-start`, ring and status wrap side by side. |
| T6 duplicate chip | `bundle.js` TimerRing renders `ModeChip` in `.os-timer-center`; `Today.tsx:276` renders a second | Correct. |
| M1 idle menu cannot start | `tray.rs:95-99` | Correct: `Idle => [SHOW, QUIT]`. |
| M4 no global shortcut | `Cargo.toml` features `["tray-icon"]`; no `global-shortcut` anywhere in `src-tauri` | Correct. |
| D2 ring numeric size, min 160 | `bundle.js` `Math.max(160, p.size || 280)` | Correct. |
| D5 full screen 764px | `.os-fullscreen` padding `space-8` (64) ×2, gap 32, ring 560, ghost button ~44 | Correct. |
| 1.1 arithmetic | tokens: `space-6` 32, heading lh 24, title lh 28, `timer-size` 280 | The stack to Start is 562px as stated, **but the brief omits the 32px bottom padding and the 52px pill itself: 562 + 52 + 32 = 646 > 600.** At 900×600 the idle Today already scrolls by about 46px with no notice and no Custom fields. The bug is worse than the brief says, which strengthens the structural fix. Correct the paragraph so the owner is not surprised by a screenshot of the plain idle state. |

---

## 2. Findings

Severity: **blocker** = resolve in the brief before mock-ups; **major** = fix before the design-system changes are made; **minor** = polish, fix in passing.

### F1 (blocker) Native full screen on a second display can black out the other displays

**Where:** §2.3, §3.12, Q7. "Full screen is a separate window ... in native full screen on the display that holds the main window, so the main window stays usable on the other display."

**Finding:** macOS native full screen creates a Space. With *System Settings › Desktop & Dock › "Displays have separate Spaces"* turned **off**, entering native full screen on one display blacks out every other display. The brief's promise (Board or Calendar stay usable next to the timer) then fails exactly for the second-screen user the owner asked for. The brief does not mention this setting.

**Fix:** Do not use native full screen. The Focus window is a borderless window sized to the target display's frame, at normal window level, with its own Space-independent behaviour (`collectionBehavior` includes `fullScreenAuxiliary` and `moveToActiveSpace`). It reads as full screen, keeps the other displays alive in every configuration, and Esc closes it without a Space animation. Keep the "Leave full screen?" confirm. Record this in Q7.

**Also (same section, owner direction 2):** "drag Orasenda there, then choose" is two actions plus a drag before the timer reaches the second screen. When `NSScreen.screens.count > 1`, the Focus-view menu lists one item per display ("Full screen on *Built-in Display*", "Full screen on *DELL U2723QE*", using `localizedName`), with the display that holds the main window first and bound to ⌘⇧F. With one display the menu keeps the single item. Nothing is remembered, which satisfies "the user's choice each time".

### F2 (major) ⌃⌥Space is already a macOS system shortcut

**Where:** §2.2 table, Q6, §3.15 tip, §3.10 menu.

**Finding:** macOS reserves ⌃Space ("Select the previous input source") and **⌃⌥Space ("Select the next input source")** in *Keyboard › Keyboard Shortcuts › Input Sources*. They are on by default and active for anyone with two input sources, which includes most bilingual users. A registered hotkey would either lose to the system or steal a system gesture. Printing it in a first-run tip and as the menu's key equivalent makes the collision the first thing some users meet.

**Fix:** Default to **⌃⌥F** for start/pause (F for focus; no system binding; one hand) and **⌃⌥N** for capture as proposed. Keep the conflict copy ("Another app uses this shortcut. Pick a different one."). Add: if registration fails at launch, the menu-bar item shows the Start item without a key equivalent and Settings › Keyboard shows the line; nothing else nags. Update the tip and every table.

### F3 (major) The app-role glyphs reuse mode shapes with other meanings

**Where:** §3.7, §4 item 9, Q12.

**Finding:** The design system's shape vocabulary is fixed: circle = focus, half circle = break, rounded square = routine, triangle = warning, hollow circle = idle/shallow, **bars = paused**. The brief gives *Distracting* the bars (reads "Paused") and *Always allowed* the rounded square (reads "Routine"). "Never by colour alone" only works if shapes are unambiguous.

**Fix:** Roles are a separate glyph family, line icons at the rail's 1.5px stroke, each always with its word: Focus → filled circle (the one deliberate overlap: focus apps serve focus sessions); Neutral → hollow circle; Distracting → a **diamond outline** (unused anywhere else); Always allowed → a **shield outline**; Never record → the closed-eye. State this in the design-system README as a rule: mode shapes are reserved for modes.

### F4 (major) The 18px status slot cannot hold a 44px action

**Where:** §3.1 hierarchy 2, §3.8 ("See summary"), §3.15 ("Got it"), §4 item 5.

**Finding:** The status line is "fixed 18px" and carries one-shot actions. Every clicked thing is at least `hit-min` 44×44 (README, Layout). A 44px ghost action cannot sit in an 18px row without overflowing into the ring row, and a smaller action breaks the hit-target rule.

**Fix:** Reserve the status row at **44px** (`hit-min`), text vertically centred, with the optional action as a ghost button inside the row. The 44 is paid for by the fluid ring. Recompute the 360×360 floor: 16 + 44 + 44 + ring + 16 + 52 + 16 = 188 + ring, so the ring is about 172 at 360 tall, still above the 160 minimum.

### F5 (major) Truncating the status text hides errors from sighted users

**Where:** §3.1 hierarchy 2: "long text is truncated visually and kept whole in the accessible name".

**Finding:** "Your last session ended while Orasenda was closed." is 51 characters; at 360 wide in `body-sm` about 45 fit. A store error ("This data was saved by a newer Orasenda.") is information the sighted user must read, not only VoiceOver. "Failures are never silent" (spec A) applies to the screen as well.

**Fix:** The status row may wrap to two lines at compact (the 44px row holds two lines of `body-sm`, 36px). Shorten the long notices so they fit one line at regular: "Last session ended while Orasenda was closed." (46) is still long; prefer "Session ended while Orasenda was closed." (40). Never truncate a store line.

### F6 (major) Single-key shortcuts (Space, F, P, T, M) need an off switch

**Where:** §3.1 keyboard (Space, F, P), §3.3 (T), §3.7 (M).

**Finding:** WCAG 2.1.4 (Character Key Shortcuts): a shortcut using only a letter or Space must be turn-off-able, remappable, or active only when a component has focus. Speech-input users trigger them by accident. The brief scopes Space to "heading or body", which is right, but F, P, T and M are page-wide.

**Fix:** Settings › Keyboard gets *Single-key shortcuts on this page* (checkbox, default on). All single keys honour it; ⌘-combinations always work. Document it in the design-system README under Accessibility.

### F7 (major) The floating timer's minimum width does not fit its own controls

**Where:** §3.11: "resizable from 200×56", "two IconButtons always visible" plus a third Close.

**Finding:** Three 44px IconButtons are 132px. Add the mode shape (20), the `timer-md` digits ("18:42" at 28px mono, about 80px) and gutters: about 260px. A 200px floor clips a button or the digits. The brief also says a non-activating panel "never takes focus" and then specifies Tab order inside it; a non-activating panel can become key when clicked but is unreachable by keyboard alone.

**Fix:** Two always-visible IconButtons (Pause/Resume and Open Orasenda); Close is Esc, the floater's context menu and the menu-bar *Floating timer* toggle. Minimum **248×56**, default 280×64. State the keyboard path: ⌘K "Floating timer" and the menu-bar item open it and give it key focus; clicking it gives it key focus without activating Orasenda.

### F8 (major) "Never record" is both a row checkbox and a fourth list

**Where:** §3.7 "Four grouped lists ... 4. Never record" and "Each row: ... a Never record checkbox".

**Finding:** A never-recorded Distracting app would appear twice (in Distracting with the box checked, and in Never record). The brief's own model says role and privacy are independent, so a list keyed by privacy is a different view of the same rows, not a group.

**Fix:** Two sections on the page, in this order: **Roles** (three groups: Distracting, Focus, Always allowed; each row has the role glyph and word, a *Never record* checkbox and the Move menu) and **Privacy** (the never-record list, which also includes Neutral apps chosen only for privacy, plus *Pause recording* as a checkbox with the line "Nothing is recorded while this is on."). An app may appear in both sections, and the Privacy section says so in one line. Also say that AppRow covers domains (P7) so "Apps and sites" is not a misnomer.

### F9 (minor) §2.1 and Q5 contradict each other on "Just 2 minutes" at compact

**Where:** §2.1 "Width is driven by the idle row ... 334px" (so it fits 360) vs Q5 "below 400px wide it moves into a chevron menu".

**Fix:** Drop the chevron menu. By the brief's own numbers both buttons fit at 360. A split button is a new component, adds a decision, and hides the 2-minute rule, which is the lowest-cost start the spec offers. If the pill ever wraps, the compact Start pill reads "Start" with the play glyph (word kept) and "Just 2 minutes" stays.

### F10 (minor) Menu key equivalent and global hotkey can double-fire

**Where:** §3.10 "Start focus · 25 min (⌃⌥Space shown as the key equivalent)".

**Finding:** If the tray menu's accelerator is live while the app is active and the global hotkey is also registered, one press can start and then pause. Tauri/muda tray menus on macOS may only display accelerators, but this must be verified.

**Fix:** Register the hotkey once (global). Show the shortcut in the item as text only if Tauri cannot display an inert accelerator. Add this to the phase 3 verification list.

### F11 (minor) Preset copy drift

**Where:** §3.10 "Custom 40/10". Spec A: the Custom default is 45/10.

**Fix:** The menu shows the saved custom values, never a literal.

### F12 (minor) Tooltip must be dismissible

**Where:** §4 item 1.

**Fix:** Add WCAG 1.4.13: Esc hides the tooltip without moving focus; the tooltip stays while the pointer is over it.

### F13 (minor) New colour pairs need the contrast run

**Where:** §4 items 1, 7, 9; D11 claims 106 pairs pass, which is the current set.

**Fix:** Phase 2 adds to `verification/contrast.py`: tooltip text on `surface-overlay`, the horizon bar on `surface` and `surface-raised` (3:1 mark), role glyphs in `ink-muted` on `surface-raised`, the floater's border in dark (shadows "barely exist" in dark, so the panel needs `line` or `line-strong`). Check both themes before any README changes.

### F14 (minor) "Realistic finish" name collision

**Where:** Q18. P3 introduces the day's "realistic finish time" (SPEC §2.3) on Today.

**Fix:** Call the summary's time "ends 15:20" (as written) and keep "Realistic finish" for the P3 day estimate so the two never share a label.

### F15 (minor) Per-session summary depends on tracking

**Where:** §3.8 "14 app switches · mostly Xcode".

**Fix:** State that the line exists only when recording is on, and shows "Private apps" when the top app is never-recorded. Without recording, the session record shows the duration only.

---

## 3. Principles check

| Principle | Result |
|---|---|
| One primary per screen | Holds on every screen described. Today running: none, Pause is quiet. Settings: none. Apps and sites: Add apps. |
| State never by colour alone | Holds for modes. Fails for app roles (F3). |
| No red; amber = almost up | Holds. Distracting is `ink-muted`, delete is the one `critical`. |
| Kind, plain copy | Holds. No exclamation marks or emoji. Shorten two notices (F5). |
| Motion slow, off under reduce-motion | Holds; tooltip delay and horizon bar both specified. |
| Contrast, focus ring, keyboard | Mostly holds; F6 (single-key off switch) and F13 (new pairs). |
| Calm by default | Holds. One tip once, no live usage. |
| Private by design | Holds; roles store bundle ids only, usage pooled for private apps. F15 clarifies. |
| Honest friction | Holds: "Strong friction, not a hard lock.", wall-clock unlock time. |
| Productivity | Holds once F2 is fixed: one action or keystroke from Today, the app, the menu bar, ⌘K and the system. Zero decisions on first run. |
| Owner 1 minimal Today | Holds. The preset summary is the only configuration on Today and never shows fields. |
| Owner 2 second screen, choice each time | Holds in intent; F1 fixes the mechanism and removes the drag. |
| Owner 3 notifications off by default | Holds, including the migration in Q4. Needs the spec A amendment the brief names. |
| Owner 4 Settings now | Holds. Theme, timer, notifications, plus Keyboard. |
| Owner 5 tracking and blocking rethink | Holds in model; F3 and F8 fix presentation. |
| Known issue | Fixed by construction; F4 adjusts the row heights and the arithmetic correction above strengthens the case. |
| Both themes | Requested for mock-ups; F13 adds the new pairs. |

---

## 4. The three Today directions

**A, Still Point:** distinct, viable at every size, the lowest-risk build, and the only one that keeps the ring-on-Today rule the design system and spec share. Its weakness (empty side space in a wide strip) is cosmetic. Lead.

**B, The Dial:** distinct in idea (the ring's centre is the Start target; "same place, same gesture") but not viable as written below regular size and weaker on its own terms:
- The rim slots (preset top, "Just 2 minutes" bottom, Focus view lower rim) crowd below 220px by the brief's own admission, so at 360×360 (ring about 172 after F4) they do not fit. Once the rim slots move to a top row, B is A with a centre Start.
- Pause and End inside the ring puts End next to Pause, which is exactly what A's `space-6` separation and ghost style prevent.
- The spatial-constancy claim holds only while idle: running, the same centre becomes display-only.
- `TimerRing` is `role="timer"`, so the button must be a layered sibling; the design system gains a composite component for a single screen.

**C, Horizon:** distinct (no ring; digits, bar, dock) and the right answer for the strip (900×240 under a monitor, an ultrawide corner). Viability costs:
- The dock at 360 wide cannot hold summary (~180) + Start pill (150) + Focus view (44) + gaps; at compact the summary must move to the top row, which converges the chrome with A.
- Using C for full screen conflicts with SPEC §2.1 ("a progress ring") as well as the design-system README; that would be a spec amendment, not a design call. A closing circle is also the stronger cue for time blindness, which is the audience.

**What should change:**
1. Mock **A** as the lead and **C** as the second direction, both at 360×360, 900×600, 900×240 and 1440×900, idle and running, both themes.
2. Fold **B into A as one variant** ("A2: centre Start"): the ring centre is the idle Start target in addition to the pill, nothing on the rim, controls row unchanged. Decide A vs A2 from the 360×360 idle mock. Do not build a rim-slot component.
3. Keep the hybrid, but trigger it by **shape, not height alone**: the strip layout (digits plus horizon bar) applies only when the content box is wider than twice its height and under 420 tall. A 360×360 window keeps the ring. Call it the "strip layout" in the design system so it is a documented state of Today, not a surprise on resize.
4. Full screen and the floating timer stay on the ring and the MenuBarTimer respectively; C does not replace them.

---

## 5. Smaller notes to carry into phase 2

- The preset popover while running is read-only (Q17). Good. Add that ⌘K "Use preset" is also disabled while running, for the same reason.
- The floating timer needs a plain **idle** state (opened before any session), not only "idle after end".
- The Focus window's caption "Space pauses · Esc leaves" and the Esc confirm are both fine; keep the confirm as the one guard against an accidental key.
- The `cqb`-based fluid ring needs its grid row to be `container-type: size`; the ring itself stays `inline-size` for the digits. Note this in the TimerRing README so the component does not silently need a measured parent.
- `.os-fullscreen` ties `min-height` to `window-min-height`; when the token drops to 360 that rule becomes harmless, but remove it anyway in favour of the fluid ring.
- Add ROADMAP and spec A amendments (Q20) as a phase 3 task so C and E scopes are written down, not implied.
