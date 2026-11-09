# Orasenda design pass, phase 2 review: picking the Today direction

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Inputs: `01-brief.md`; the three canvases (files read, not rendered: `Today.dc.html`, `Win.dc.html`, `Strip.dc.html`, their Main, Proof, Controls and Minimum boards and stylesheets); `design/system/README.md`, `tokens.json`, `TimerRing` and `StartButton` READMEs; `docs/SPEC.md` §1; `docs/specs/2026-11-08-focus-session-loop.md` (Today contract); `design/reviews/01–03`.
- Scoring: 1–10 on principles (SPEC §1, design system README, the owner's rules) and 1–10 on productivity (most focused work, least friction). A direction that breaks a principle is wrong, so violations are listed even when small.

## Decision

**Chosen: A, Still Point**, with C (Horizon) adopted as the strip layout it was always meant to be, and five ideas grafted from A2 and C.

## Scores

| Direction | Artifact | Principles | Productivity |
|---|---|---|---|
| A: Still Point | https://claude.ai/artifact/PCgq6TwYj2PDtjRw2YYqea | 9 | 8 |
| B: A2, Still Point with centre Start | https://claude.ai/artifact/5hrrbc3JCwP3xo8NMgN6vo | 7 | 8 |
| C: Horizon (strip layout) | https://claude.ai/artifact/AmzaQXPBw3pLboPo1ePg9h | 8 | 7 (9 inside its niche) |

### A: Still Point

**Violations found**
1. While paused the summary reads "Paused · 18 min left" and the ring's chip reads "Paused". Spec A's Today contract says the screen must not say "Paused" twice (the chip is the one state word). C's wording, "Classic · 18 min left", avoids this.
2. The "slow fade into amber" (decided) is drawn with `duration-calm` (320ms). That is a step, not a slow fade. A new duration token is needed; the canvas records this as open item 1 and it must close before phase 3.
3. The mock's Today has `<section aria-label="Today">` but no visually hidden `h1`, which the brief requires for focus after a page change (B and C both include it).
4. The store line in the mock ("Your past sessions couldn't load. You can still start.") is not one of spec A's two store lines ("Orasenda can't save sessions right now." and "This data was saved by a newer Orasenda."). Copy must come from the spec, not be invented per board.

**Reasoning.** A is the only direction that keeps every rule at once: the ring stays `role="timer"` and never becomes a control; the idle state keeps its word ("No session") and shape (hollow circle); the primary stays the design system's 52px pill with the word and a play glyph; Pause, Resume and End are icon controls with tooltips on hover and focus, VoiceOver labels and 44/52px targets; amber appears only with the triangle and "Almost up"; nothing uses red; copy is plain. The layout fixes the known issue by construction: four tracks, one flexible, a reserved 44px status row, configuration off the screen, no page scroll. The arithmetic checks (188px fixed at 360×360, 260 at 900×600, Start's bottom edge at 344/568/868). On productivity, starting is one keystroke from anywhere (Space, ⌘↩, ⌃⌥F, menu bar), the preset is one quiet line away, and the controls row never moves between idle and running, so the eye learns one place for Start, Pause and End. The remaining risks are unverified rather than wrong: the idle row at 360 wide (estimated 316 of 328px) and the x-import of the real TimerRing inside dc-import.

### B: A2, Still Point with centre Start

**Violations found**
1. The disc covers the idle ring's "No session" chip. The idle state loses its visible word; only VoiceOver still hears it. The design system defines idle as "hollow circle + No session", so the visible state word is gone.
2. A filled `focus` disc of up to 240px is the loudest object in the app and it sits on the one screen that must be almost empty. The design system's primary Start is a `radius-pill` at `control-lg`; the disc is a new primary form and a `StartButton` change the brief did not propose.
3. The tooltip and popover borders use `line` (a hairline that "carries no meaning", about 1.6:1 on `surface`), not `line-strong`. A tooltip edge is a UI mark and needs 3:1. A and C use `line-strong`.
4. The same paused-summary duplication as A ("Paused · 12 min left" beside the "Paused" chip).
5. The disc shows "25 min" and the summary shows "25 min": the same fact twice on one calm screen.

**Reasoning.** A2 is honest about its costs and its canvas is thorough (the row-budget overlay, the controls specimen with hover, pressed, focus and loading, the denied-notification state). Its one idea is sound Fitts reasoning: the hardest moment gets the largest target where the eye already rests. But the gain is small for this product: the fast paths are keystrokes and the global shortcut, which are identical in A, and the 52px pill in a fixed row is already an easy target. The costs land on principles: the ring reads as two things (a display that is sometimes a button), the idle word disappears, and the disc is a saturated fill competing with the ring for attention, exactly the "attention-grabbing" quality the product avoids. Its own canvas concedes that spatial constancy holds only while idle; once running, Pause is below the ring as in A, so the user learns two places instead of one. Productivity scores 8 because starting is as fast as A for mouse users and the idle row is calmer, but the re-orientation cost after Start cancels much of that.

### C: Horizon (strip layout)

**Violations found**
1. The digits track is described as able to "shrink to nothing". A countdown that can vanish breaks "time is always visible" and the design system's "a countdown is never clipped". It needs a floor (never below `timer-md`, 28px).
2. The Pages button uses a native `title` attribute as its tooltip. Native `title` does not show on keyboard focus, which the brief's IconButton rule (D1) exists to prevent.
3. While paused the status slot reads "Paused. Your time is kept." under the "Paused" chip: the same word twice, the same spec A rule as above.
4. Menu items are drawn as `div role="menuitem"` rather than buttons. Acceptable only because they stand for native NSMenus; the canvas should say so where they appear.

**Reasoning.** C is not a second Today; it is what Today must become when the window is a strip, and it is the only composition that stays legible there. Its decisions are good: the layout is chosen by shape, not height alone; the top row is A's, so nothing moves between the ring and the strip; the bar carries a triangle at its end when almost up, so the bar never relies on colour; idle shows "25 min" in muted type instead of fake digits; the state column keeps the chip as the only state word. It also catches a real inconsistency in the brief: a 360×360 minimum makes the brief's own 900×240 example impossible, and C resolves it with a 360×240 minimum and a stacked strip. As the main Today direction it scores lower because a linear bar is a weaker at-a-glance cue than a draining circle (C says so itself), the chip and digits can be far apart on an ultrawide strip, and the 360×240 stacked strip is cramped (chip plus a two-line store message plus the action at 360 wide is at the edge of fitting). Inside its niche, a strip under a monitor, it is the best of the three for getting work done: large digits readable from a distance, controls in one fixed column, nothing to decide.

## Why A, in one paragraph

The owner asks two questions. On philosophy, A is the only direction with no principle cost: the ring is a timer, the idle state keeps its word, the primary is the design system's own pill, the screen is empty apart from time and one action. B buys a bigger target with the loudest object in the app and a ring that is sometimes a button. C is right for strips and wrong as the main screen. On friction, A and B are equal where it matters (one keystroke from anywhere, preset one line away, configuration off the screen), and A wins on re-orientation: Start, Pause, Resume and End share one fixed row, so a person with ADHD learns one place and never hunts. A also carries the lowest build risk because it changes structure (grid, fluid ring, status row) rather than components.

## Graft into A

1. **From C: the strip layout and the minimum.** Today switches to Horizon's three-column strip when the content box is wider than twice its height and under 420px tall, and to the stacked strip under 360 tall and under 640 wide. The window minimum becomes 360×240 (tokens `window-min-width` 360, `window-min-height` 240), replacing the brief's 360×360. The switch happens only on resize, never on a tick.
2. **From C: paused wording.** The summary while paused reads "Classic · 18 min left" (preset, time left), never "Paused · …". The chip is the only "Paused".
3. **From B and C: a visible Pause/Resume target.** The 52px circle gets a `surface-raised` ground and a `line-strong` edge so the target is visible, not only the glyph.
4. **From B: a tooltip on the preset summary** ("Change preset · P") on hover and keyboard focus, so the single-key shortcut is discoverable. B's row-budget overlay also becomes the model for the Playwright layout test's assertions.
5. **From B: drawn states A left to captions.** The Start loading state ("Starting…", design system `StartButton`), the denied-notification state with "Open System Settings", and the Settings › Keyboard section, drawn in both themes before phase 3.
6. **From C: the triangle at the bar's end** is the model for the strip; on the ring the chip's triangle already does this job, so nothing is added there.

## Must-fix in A before phase 3

1. **Slow amber fade.** Add a `duration-slow` token to the design system (about 1600ms, `easing-calm`) for the ring and chip fade into `amber`; instant under reduce-motion. Design-first: artifact, then `design/system/`, then code. Record it under "Motion and the two-minute cue" in the README.
2. **No second "Paused".** Summary reads "Classic · 18 min left" while paused (graft 2). Keep spec A's test that exactly one "Paused" node exists.
3. **Spec copy only.** Status-row lines come from spec A: "Session ended.", "Session ended while Orasenda was closed.", "Orasenda can't save sessions right now.", "This data was saved by a newer Orasenda.", plus the one-time tip. Remove the invented store line. Check the longest spec line fits two lines of `body-sm` at 360 wide beside a 44px action.
4. **Hidden heading.** Add the `os-sr-only` `h1` "Today" that receives focus after a page change; document the tab order (Pages → summary → Focus view → status action → controls).
5. **Verify the 360 idle row with real fonts.** The 316-of-328px estimate must be measured in WebKit with Atkinson Hyperlegible Next. If it wraps, the pill reads "Start" with the glyph and the accessible name stays "Start focus", as the brief says; add that case to the layout test.
6. **One menu model, recorded.** A uses native NSMenus for Pages and Focus view and an in-webview popover for presets. Keep that call (navigation and commands are native; the preset popover carries radios and a heading), and write it into the design system README so the strip and the menu bar follow the same rule.
7. **Window tokens.** Update `window-min-width` 360 and `window-min-height` 240, add the layout-class and strip thresholds (brief §4 item 3), and replace "scroll below it" with the no-scroll rule for timer surfaces.
8. **Contrast pass for the new pairs** (brief §4 item 15): tooltip text on `surface-overlay`, the status-row text and its `focus` ghost action, the warning status text, the `line-strong` tooltip edge, the horizon bar fill and track, and the floater edge in both themes. Run `verification/contrast.py` before anything ships.
9. **Rail icons** stay placeholders only until the icon set (brief §4 item 14) lands; the final icons must be in the design system before the app uses them.
10. **Layout test.** Playwright WebKit at 360×240, 360×360, 640×480, 900×240, 900×600, 1440×900, each with the longest status line and an action, asserting the controls row is inside the viewport, the status row is exactly 44px and `scrollHeight <= innerHeight` on Today, Focus and Floating.

## Calls I made (not reopened above)

- The 360×240 minimum is accepted on the strength of C's arithmetic (188px fixed, 52px for digits at the minimum), with the digits floor from must-fix note in C. If phase 3's layout test shows the stacked strip cannot hold the longest spec store line beside the chip at 360 wide, the status text goes under the chip and the minimum height rises to 280. The 900×600 default does not change.
- The A vs A2 decision was made from the 360×360 idle windows as the brief asked. At that size the 127px disc fills the ring's inner disc and the "No session" word disappears; the pill below the ring keeps the ring whole. A wins at the size where the two were meant to be compared.
