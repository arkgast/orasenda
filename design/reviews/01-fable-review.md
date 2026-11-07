# Orasenda design system v1: design review

Reviewer: senior product designer (UI/UX, WCAG 2.2, ADHD-friendly, macOS). Scope: `project/README.md`, `tokens.json`, `components/bundle.css`, `components/bundle.js`, `components/index.d.ts`, the 10 component previews/READMEs and `Cover/preview.html`, against SPEC.md sections 1–3 and ROADMAP P1–P4. Review only; no files were edited. Previews were not rendered; findings come from the code plus a contrast script (`review/contrast.py`, run against `tokens.json`).

All file paths below are relative to `/private/tmp/claude-501/-Users-arnoldgandarillas-Projects-Veloud-epochopomo/94f4e6fc-54ce-43b2-9017-d774fcc666fa/scratchpad/ds/project/`.

## Overall verdict

Strong first pass. The palette is calm, every text pair clears 4.5:1 in both themes (worst case light `focus` on `focus-soft` 4.86:1, dark 6.43:1), the dark theme is genuinely designed rather than inverted, the voice rules are exactly right, and the four mode shapes give "never by colour alone" a concrete mechanism. The problems are concentrated in three places: (1) states and semantics the components do not yet have (disabled, pressed, dialog focus handling, controlled checkbox, focusable cards), (2) three colour pairs that are invisible or ambiguous (`surface-sunken` on `surface` at 1.1:1 used for the timer track, future habit dots and the overflow hatch; `routine` vs `amber` at 1.05:1 lightness; the cover's arcs on the ink slab), and (3) two places where the spec's "never judge" and "never colour alone" principles are broken in detail: the amber over-estimate square on `TaskCard`, and the `MenuBarTimer` warning state that is colour-only.

---

## P0: bugs (ship-blocking in the same class as the fixed break-hover bug)

### P0.1 `MenuBarTimer` shows "almost up" by colour alone, and is unlabelled for VoiceOver
**Why it matters.** Spec 1.7 "State is never shown by color alone" and README "Never by colour alone". In `warning` mode the only change is the 12px ring stroke going amber (the `title` tooltip is not an accessible signal). This is the one surface the spec says must be "always visible", so it is where the principle matters most. Also the `<span>` has no role, no label and no mode, so VoiceOver reads "18:42" with no context.
**Fix (`components/bundle.js`, `MenuBarTimer`).**
- Render the mode `Shape` glyph (the same one `ModeChip` uses) at 10px before the ring, or replace the 12px ring with the shape in `warning` mode (triangle) and `break` mode (half circle). The ring stays for `focus`.
- Add `role: "timer"`, `"aria-live": "off"`, and `"aria-label": MODE_LABEL[mode] + ", " + (p.remainingLabel || p.remaining) + " remaining" + (p.task ? ", " + p.task : "")`.
- Add a `compact` prop (menu bar: digits + glyph only, no task; the macOS menu bar cannot show a 180px task string). The task text belongs only in the floating mini timer variant.
**Also (`components/bundle.css`).** The 12px ring with `stroke-width: 3` on `r: 4.5` leaves a 3px hole; at menu-bar scale it reads as a blob. Use `stroke-width: 2` and `r: 5`, or 14px viewBox. Add `transition: stroke var(--duration-calm) var(--easing-calm)` to `.ring-prog` so the switch to amber is slow, not a flash.
**Files.** `components/bundle.js`, `components/bundle.css`, `components/index.d.ts` (add `compact?: boolean; remainingLabel?: string`), `components/MenuBarTimer/README.md`.

### P0.2 Timer track, future habit dots and the overflow hatch are invisible (`surface-sunken` on `surface` = 1.10:1 light, 1.06:1 dark)
**Why it matters.** ADHD-friendly "time is always visible": the `TimerRing` track is what tells the user how much of the session is left relative to the whole. With `stroke: var(--surface-sunken)` on a `surface` ground, the track is a 1.1:1 ghost in both themes; the ring looks like a lone arc floating in space. Same token is used for `.os-dot-future` (so future days vanish on the Routines screen, which sits on `surface`) and for the `.os-block-overflow` hatch (so the overflow block is a blank outlined box).
**Fix (`components/bundle.css`).**
```css
.os-timer .track { fill: none; stroke: var(--line); }                     /* 1.40:1 light, 1.45:1 dark: visible, still quiet */
.os-dot-future { background: transparent; border: 1.5px solid var(--line); }
.os-block-overflow { background-image: repeating-linear-gradient(135deg, var(--line) 0 2px, transparent 2px 10px); }
```
`line` is meant for hairlines that carry no meaning, which is exactly what a track and a future day are. Keep `line-strong` (3:1+) for marks that carry meaning (missed day, control borders).
**Files.** `components/bundle.css`; add a line to `README.md` "Colour": "Use `line` for tracks, future days and hatching, never `surface-sunken` on `surface` (1.1:1)."

### P0.3 `Button` has no disabled, pressed or loading state, and hover uses `filter: brightness()` which lowers label contrast in light
**Why it matters.** Same class as the break-hover bug: state styling that is missing or that fights the token system. A disabled primary "Start focus" (e.g. no task selected yet, or a session already running) currently looks fully enabled; a pressed button gives no feedback; `filter: brightness(1.08)` lightens the light-theme `focus` fill to `#30748c`, dropping the white label from 5.94:1 to 5.25:1 (still passes, but it drifts away from the tokens and will fail the moment the fill is tuned). It also creates a stacking context that can clip the focus ring in some containers.
**Fix (`tokens.json`, colour family; add four tokens).**
```json
{"name":"focus-hover","value":{"light":"#245a6e","dark":"#93cce0"},"usage":"Primary button hover. Darker in light, lighter in dark; on-focus still 7.6:1 / 10.6:1."},
{"name":"focus-pressed","value":{"light":"#1e4c5d","dark":"#a6d8e8"},"usage":"Primary button pressed."},
{"name":"break-hover","value":{"light":"#355a40","dark":"#a8d4b3"},"usage":"Break button hover."},
{"name":"break-pressed","value":{"light":"#2d4d37","dark":"#b8dfc2"},"usage":"Break button pressed."}
```
**Fix (`components/bundle.css`).** Replace the two `filter` rules with:
```css
.os-btn-primary:hover { background: var(--focus-hover); border-color: var(--focus-hover); }
.os-btn-primary:active { background: var(--focus-pressed); border-color: var(--focus-pressed); }
.os-btn-break:hover { background: var(--break-hover); border-color: var(--break-hover); }
.os-btn-break:active { background: var(--break-pressed); border-color: var(--break-pressed); }
.os-btn-quiet:active, .os-btn-ghost:active { background: var(--line); }
.os-btn:disabled, .os-btn[aria-disabled="true"] { opacity: 0.45; cursor: default; pointer-events: none; }
.os-btn[aria-busy="true"] { cursor: progress; }
.os-btn { transition: background var(--duration-quick) var(--easing-calm), border-color var(--duration-quick) var(--easing-calm), color var(--duration-quick) var(--easing-calm); }
```
Keep the label text visible in every state (no `color: transparent` tricks for loading; show "Starting…" as the label instead). Add `loading?: boolean` to `Button`, which sets `aria-busy` and `disabled`. Add a `critical` variant for the one destructive flow (see P2.3).
**Files.** `tokens.json`, `components/bundle.css`, `components/bundle.js`, `components/index.d.ts`, `components/Button/README.md`, `components/Button/preview.html` (add disabled and loading examples).

### P0.4 `TaskCard` shows sessions over the estimate in `amber`, the system's "warning" colour
**Why it matters.** Spec 1.4 "Metrics show neutral trends, never failures"; spec 2.2 pads estimates and auto-tunes from history, so going over is expected data, not a fault. `amber` is defined (tokens and README) as "Time almost up / WIP limit reached". Painting an over-estimate session amber makes the card read as a warning and feels like judgement, exactly what the brief flags. The square shape also borrows the warning vocabulary. Also the `aria-label` "2 of 1 sessions" is ungrammatical.
**Fix (`components/bundle.css`, `bundle.js`).**
```css
.os-pomo-over { background: var(--focus); box-shadow: inset 0 0 0 1.5px var(--surface-raised), 0 0 0 1.5px var(--line-strong); border-radius: 50%; }
```
(a focus dot with a thin halo: "also done, beyond the plan", same hue, no alarm). Or simpler: same `os-pomo-done` fill plus a hairline `|` separator after the estimated count. Change the label to a sentence VoiceOver can read: `done + " sessions done, " + est + " estimated"`, and in the visible meta use the README's own format "Est 1 · Done 2 · 0h 41m". Never show a ratio or percentage.
**Files.** `components/bundle.css`, `components/bundle.js`, `components/TaskCard/README.md` (replace "an `amber` square is a session over the estimate").

### P0.5 `IntentPrompt` is a `role="dialog"` without modal semantics, focus management or a unique id
**Why it matters.** Spec 1.7 full keyboard and VoiceOver support. As built: no `aria-modal`, no initial focus, no Esc handling, no focus trap, and a hard-coded `id="os-intent-title"` that duplicates if two prompts (overlay + mini timer) mount. VoiceOver users will land behind the scrim.
**Fix (`components/bundle.js`).** `aria-modal: true`; generate the id with `R.useId()`; `autoFocus` the primary "Back to focus" button (`R.useRef` + `useEffect` focus on mount); on `Escape` call `p.onReturn` (the kind default, not the bypass); add `aria-describedby` on the paragraph. Document that the host must render it in a portal on `scrim` and trap focus. Wrap the breathing circle and copy in a `<form>`-free `div`; keep `onWait` as the ghost.
**Files.** `components/bundle.js`, `components/IntentPrompt/README.md`.

### P0.6 `RoutineItem` is uncontrolled and its hit target is 20×20
**Why it matters.** `useState(!!p.done)` with no `onChange` means the app cannot read or set completion, so the component cannot ship in P4. The 20px checkbox fails WCAG 2.2 2.5.8 (24×24 minimum) and macOS comfort (44pt). The spec's "starting takes as little effort as possible" argues for the whole row being the target.
**Fix (`components/bundle.js`).** Add `onChange?: (done: boolean) => void`; treat `done` as controlled when `onChange` is provided (`var done = p.onChange ? !!p.done : st[0]`). Make the entire row a `<label>` or a `<button role="checkbox">` (the row, not the 20px box) with `min-height: 44px`, keep the drawn 20px box as a visual. Keep `aria-checked`. Add `.os-ritem:hover { background: var(--surface-sunken); }` and `.os-ritem:has(:focus-visible)` outline.
**Files.** `components/bundle.js`, `components/bundle.css`, `components/index.d.ts`, `components/RoutineItem/README.md`.

### P0.7 Focus-visible selector misses inputs, links and non-button checkboxes
**Why it matters.** The global `:where(button, [tabindex]):focus-visible` is the only focus ring in the system. The P2–P4 inputs (`<input>`, `<textarea>`, `<select>`, `<a>`, `[role=checkbox]` on a div) get the browser default instead of the 2px `focus-ring`.
**Fix (`components/bundle.css`).**
```css
:where(a[href], button, input, select, textarea, summary, [tabindex]):focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
```
**Files.** `components/bundle.css`.

---

## P1: important (spec-principle gaps, dark-theme and legibility issues, missing MVP pieces)

### P1.1 `.os-block-now` reuses the keyboard focus ring; "now" is colour + outline only
**Why.** The in-progress block gets `outline: 2px solid var(--focus); outline-offset: 2px`, which is pixel-identical to `:focus-visible`. Once blocks are focusable (they must be: drag-to-block, keyboard reschedule), focus and "now" are indistinguishable, and "now" is still colour-only.
**Fix (`components/bundle.css`, `bundle.js`).** Replace the outline with a 3px left bar and the word: `.os-block-now { box-shadow: inset 3px 0 0 var(--focus); }` and render "Now · " before the type word in `.os-block-time` when `p.now`. Add a `NowLine` token/pattern for the calendar (a 1px `focus` rule with a 6px dot and the wall-clock time, `timer-sm`). Make `TimeBlock` a `<button>` or `role="button"` with `tabIndex=0` and `aria-label: title + ", " + type + ", " + start + " to " + end`.
**Files.** `components/bundle.css`, `components/bundle.js`, `components/TimeBlock/README.md`.

### P1.2 `TimeBlock` has no compact variant; short blocks overflow
**Why.** Height comes from duration. A 15-minute block at a typical 2px/min is 30px, but the content is two lines (18 + 16 + 4 gap + 16 padding = 54px). Text will spill or be clipped on every short Break/Routine block, which are the most common short blocks.
**Fix.** In `TimeBlock`, when `height < 44` add `os-block-compact`: one line, `padding: 2px var(--space-2)`, shape + title + time inline (`title · 10:00`), `overflow: hidden; white-space: nowrap; text-overflow: ellipsis`. Document the px-per-minute scale in `README.md` (suggest `2px/min` day view: 30-min block = 60px = fits two lines).
**Files.** `components/bundle.js`, `components/bundle.css`, `README.md`.

### P1.3 `routine` and `amber` are the same lightness and nearly the same hue; dark `routine-soft` vs `amber-soft` also collide
**Why.** `routine` vs `amber` is 1.05:1 light and 1.02:1 dark; both are brown-orange. Routine chips and Warning chips look like one family, so "warm sand" does not read as its own mode, and the only thing separating a routine block from an "almost up" notice is the shape. Harmony: the spec wants "warm sand" for routines, not a second amber.
**Fix (`tokens.json`).** Shift routine to a muted taupe-sand with much lower chroma, leaving amber as the only vivid warm:
```json
{"name":"routine","value":{"light":"#6b5a47","dark":"#cdb996"}},
{"name":"routine-soft","value":{"light":"#ece5d9","dark":"#2c2620"}}
```
Verified: routine on surface 6.02:1 light / 9.21:1 dark, on routine-soft 5.28:1 / 7.81:1. `on-routine` unchanged. Amber then differs from routine by saturation, not by lightness alone, which matches how the system already separates `shallow` (no hue) from `focus`.
**Files.** `tokens.json`; README colour table wording ("Routine: muted sand; Warning: the only saturated warm").

### P1.4 Full-screen `TimerRing`: too-thin stroke, unclamped task line, and the ring fills instead of draining
**Why.** Spec 2.1 full-screen: very large tabular numerals, the current task, a small wall clock, a progress ring. At `size: 560` the default `stroke: 8` is 1.4% of the diameter, a thread that disappears at 2 m from a 27" display. `.os-timer-task` has `max-width: 70%` and no clamp, so a long task title wraps to three lines and pushes the digits off centre. And `progress` is "elapsed", so the arc fills up as time passes: for time blindness, the stronger pattern (Time Timer, Apple's Timer) is a remaining arc that shrinks toward zero; what the eye sees is "how much is left", which is the ADHD-relevant quantity.
**Fix.**
- `TimerRing`: default `stroke = Math.round(size / 40)` (7 at 280, 14 at 560). Add `clock?: string` prop rendered under the task in `timer-sm`, `ink-muted`, `aria-label "Wall clock"`.
- `.os-timer-task { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 60%; }`
- Add `fill?: 'remaining' | 'elapsed'` with `remaining` as default: `strokeDashoffset: c * progress` (arc = what is left). Document in README: "The ring shows what is left, not what is spent."
- Add `transition: stroke var(--duration-calm) var(--easing-calm)` to `.os-timer .prog` so the focus→amber change at 2:00 is gradual.
- `aria-label`: `MODE_LABEL[mode] + ", " + (p.remainingLabel || p.remaining) + " remaining"`; accept `remainingLabel` ("18 minutes 42 seconds") so VoiceOver does not read "eighteen colon forty-two".
- Add a `FullScreenFocus` layout example (see P1.9) rather than only a README sentence.
**Files.** `components/bundle.js`, `components/bundle.css`, `components/index.d.ts`, `components/TimerRing/README.md`, `components/TimerRing/preview.html` (add a 560 example with `clock`).

### P1.5 `HabitDots` cannot express "today, done", and the states lack a legend and kind words
**Why.** `days` is one enum, so a day is either `today` or `done`. The moment the user ticks today's habit the dot has no state. Also `title: d` exposes raw enum text ("missed", "future") as tooltips; "missed" is the one word the brand book says not to lead with. Forgiveness is well handled visually (hollow, not broken), but two misses in a row only exist as README advice, not as a component affordance.
**Fix (`components/bundle.js`, `index.d.ts`).** Change `days` to `Array<{ state: 'done'|'skipped'|'rest'|'future'; today?: boolean }>` (keep accepting strings for compatibility). Render today as an outer `focus` ring around whatever the inner state is (`.os-dot-today { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--focus); }`). Rename `missed` to `skipped` in the API and label; tooltip copy: "Done", "Not done", "Rest day", "Today", "Upcoming". Add a `legend?: boolean` prop that prints the four states with their shapes in `body-sm` once per screen. Add `restartNote?: string` the host passes after two skipped days ("Two days off. Today is a fresh start.") rendered in `ink-muted`, never in `amber`.
**Files.** `components/bundle.js`, `components/index.d.ts`, `components/HabitDots/README.md`, `components/HabitDots/preview.html`.

### P1.6 Fonts are loaded from Google Fonts over the network
**Why.** Spec 1.5 "Private by design"; the `@import url("https://fonts.googleapis.com/…")` in `bundle.css` makes every window ping Google, and `tokens.json` `type.fonts` is empty, so an implementer has no instruction to bundle. Also `font-display: swap` will flash a fallback in the timer digits.
**Fix.** Declare the three families in `tokens.json` `type.fonts` with licence notes (Atkinson Hyperlegible Next and Mono: Braille Institute, OFL; Lexend: OFL) and a rule in README "Fonts ship inside the app bundle; no network font loading." Keep the `@import` only in the DS preview CSS, behind a comment, or move it to the preview harness.
**Files.** `tokens.json`, `components/bundle.css`, `README.md`.

### P1.7 Reduce-motion rule contradicts the README ("keep opacity changes only")
**Why.** `* { transition: none !important; }` kills every transition, including opacity, and also removes the one-second `stroke-dashoffset` step, which under reduce-motion is actually fine. README says opacity may remain. Pick one.
**Fix (`components/bundle.css`).**
```css
@media (prefers-reduced-motion: reduce) {
  .os-breath i { animation: none; transform: scale(1); }
  * { transition-property: opacity, color, background-color, border-color !important; transition-duration: var(--duration-quick) !important; }
}
```
Add `duration-breath` note: under reduce-motion the circle is static at scale 1 (not 0.7, which looks like a dot).
**Files.** `components/bundle.css`, `README.md` "Motion".

### P1.8 Missing tokens the P1–P4 components will need
**Fix (`tokens.json`), in list shape:**
- Colour: `focus-hover`, `focus-pressed`, `break-hover`, `break-pressed` (P0.3); `critical-soft` `{"light":"#f4e1dd","dark":"#3b1f1b"}` and `on-critical` `{"light":"#ffffff","dark":"#0d1416"}` (5.48 / 6.85 and 6.90 / 8.49); `surface-overlay` `{"light":"#ffffff","dark":"#1f2b30"}` for the command palette and popovers (one step above `surface-raised` in dark so a popover reads as floating); `selection` `{"light":"{focus-soft}","dark":"{focus-soft}"}` for selected rows/cards.
- Type: `timer-md` 28px / 32px / weight 400 (mini floating timer and the full-screen wall clock; 13px is too small for a floating window read from across the room); `caption` 11px/14px/500 for the kanban WIP counter and calendar hour labels.
- Spacing: `space-1-5: 6px` is used three times in CSS as a magic number (menubar gap, block-title gap, intent). Add it or round those to `space-2`.
- Size family (new): `{"tokens":[{"name":"control-sm","value":"28px"},{"name":"control-md","value":"40px"},{"name":"control-lg","value":"52px"},{"name":"hit-min","value":"44px"},{"name":"rail-width","value":"64px"},{"name":"window-min","value":"900x600"}]}`.
- Z-index family: `z-rail 10`, `z-popover 100`, `z-overlay 1000`.
**Files.** `tokens.json`, `README.md`.

### P1.9 Components the roadmap P1–P4 clearly needs and that are absent (prioritised)
1. **`FullScreenFocus` layout** (P1): `surface` ground, `space-8` margins, `TimerRing` 560 with `timer-xl` digits, task, wall clock in `timer-md`, a single ghost "Leave full screen" that asks for confirmation on Esc. Give it a preview; this is the screen the spec describes most precisely.
2. **`TwoMinuteWarning` treatment** (P1): not a new component but a documented composite: ring and chip switch to `warning` over `duration-calm`, the `MenuBarTimer` shows the triangle glyph, a soft chime, and an optional `InlineNotice` "Two minutes left. Finish the thought." No modal, no flash.
3. **`Input` / `TextArea`** (P1 capture pad and intent; P2 task fields): `surface-sunken` ground, `line-strong` border, `radius-sm`, 40px high, label above in `body-sm`, `focus-ring` outline, helper and error text that is `ink-muted` with an icon (never red-only; `critical` text only for data loss).
4. **`CapturePad`** (P1): a 420px `surface-overlay` panel at `radius-lg`, one `TextArea`, two `ModeChip`-style toggles "Internal" / "External" interruption (as a real radio group with `aria-checked`), "Save to Inbox" primary. Esc saves, never discards.
5. **`InlineNotice` / `Toast`** (P1 deep-hours cap, P2 WIP limit, P2 breakdown prompt): `surface-raised`, `line` border, shape glyph + `body` text, optional one ghost action; amber only for "almost up" and WIP; never stacked, never auto-dismissed under 8 s, `role="status"`.
6. **`NavRail`** (P1): 64px wide, six items, icon + label always (no icon-only), `aria-current="page"`, selected = `focus-soft` ground + `focus` text, 44px items.
7. **`KanbanColumn`** (P2): `surface-sunken` well, `heading` title + `caption` counter "1 / 1"; at the limit the counter becomes a `ModeChip mode="warning"` reading "At limit"; Today past 3 shows "4 of 3" in `amber` text with the triangle, never a red badge.
8. **`CommandPalette`** (P1 ⌘K): `surface-overlay`, `shadow-overlay`, `Input` on top, results as rows with `body` text and `body-sm` hint, keyboard-only navigation documented.
9. **`Dialog`** (P1 Esc confirmation, P4 delete data): generalise `IntentPrompt`'s shell: title, body, primary + ghost, `aria-modal`, focus trap, Esc = safe action.
10. **`EmptyState`** (P2 empty Inbox/Today, P4 no reviews yet): one `heading`, one `body` line in the brand voice ("Nothing here yet. That's fine."), one quiet action, no illustration required.
11. **`StartButton`** composite (P1 Today): `Button primary lg` "Start focus" with a `quiet` "Just 2 minutes" beside it and the realistic finish time in `body-sm` underneath; document as the one primary action on Today.
**Files.** New folders under `components/`, `bundle.js`, `bundle.css`, `index.d.ts`, `README.md`.

### P1.10 `TaskCard` and `TimeBlock` are static `div`/`article` elements
**Why.** Both must be focusable (kanban keyboard move, drag-to-block). Without `tabIndex`, `role`, and an `onOpen`/`onSelect`, they cannot meet spec 1.7.
**Fix.** `TaskCard`: `tabIndex: 0`, `role: "button"`, `aria-pressed` when `active`, `onClick`/`onKeyDown` Enter/Space → `p.onOpen`; `.os-card:hover { border-color: var(--line-strong); }`; `.os-card:focus-visible` inherits the global ring. Drop the fixed `width: 280px` (let the column size it; keep `max-width: 100%`). Add `selected` (focus-soft ground) separate from `active` (the running session).
**Files.** `components/bundle.js`, `components/bundle.css`, `components/index.d.ts`, both READMEs.

### P1.11 `IntentPrompt` offers no honest "continue" path
**Why.** Spec 1.3 "Friction over prohibition. Distractions get harder to reach but never become impossible without consent." The prompt has "Back to focus" and "Wait 10 minutes, then decide" but no way to say "I need this now", so Gentle mode behaves like Firm. The spec's weekly review also wants "the reasons given for bypassing blocks" (`BypassEvent`), which needs a reason to be captured here.
**Fix.** Add a third, lowest-emphasis action `onContinue?(reason?: string)` rendered as a text link in `body-sm` `ink-muted` below the ghost ("Continue to YouTube for work") that reveals three reason chips ("Work", "Quick check", "Other") as a radio group; selecting one calls `onContinue(reason)`. Keep it visually tertiary so the primary stays "Back to focus". Never count bypasses on this screen.
**Files.** `components/bundle.js`, `components/index.d.ts`, `components/IntentPrompt/README.md`.

---

## P2: polish

### P2.1 Light `surface` is cool mist; the spec asks for warm off-white
**Why.** Spec 3 "warm off-white or deep slate backgrounds". Light `surface #f2f5f4` and `surface-sunken #e6ebe9` are blue-green tinted; with teal `focus` the whole light theme skews cold, which is the opposite of "calm sand" the Routine mode wants to live on. Dark is right (deep slate).
**Fix (`tokens.json`, light values only), verified:** `surface #f4f2ed` (ink 13.2:1), `surface-raised #fffdf9`, `surface-sunken #e9e6df` (ink-muted 4.82:1, focus 4.77:1, amber 4.95:1), `line #cfcac0`, and darken `line-strong` to `#6e7f82` so it holds 3:1 on the warm well (`#78898c` on `#e9e6df` is 2.93:1). Re-run `review/contrast.py` after the change.
**Files.** `tokens.json`, token `usage` strings ("Cool mist" → "Warm off-white").

### P2.2 `timer-xl` letter-spacing on a monospace face
**Why.** `-0.02em` on tabular mono digits at 168px risks "1" and "7" colliding with the colon; tabular alignment already handles width.
**Fix.** `timer-xl` and `timer-lg` `letterSpacing: "0"`. Add `"fontVariantNumeric": "tabular-nums"` to the three timer styles in `tokens.json` so the style, not just the CSS, carries the requirement.
**Files.** `tokens.json`, `components/bundle.css`.

### P2.3 `critical` has no button variant, soft tint or `on-` token
**Fix.** With P1.8's tokens: `.os-btn-critical { background: var(--critical); border-color: var(--critical); color: var(--on-critical); }`, only in a `Dialog` whose title names the loss ("Delete all tracking data?"). README: "critical appears at most once in the whole app, inside a confirmation dialog, never on a card or in a list."
**Files.** `components/bundle.css`, `components/bundle.js`, `components/index.d.ts`, `README.md`.

### P2.4 `ModeChip` used as a toggle will be 28px high
**Fix.** Document: `ModeChip` is a label, never a control. Filters and the Internal/External toggle use a `ChipToggle` with `min-height: 32px` and at least 44px hit area via padding or an invisible `::before`.
**Files.** `components/ModeChip/README.md`.

### P2.5 Hard-coded values outside the token system
`gap: 6px` (`.os-menubar`, `.os-block-title`), `gap: 2px` (`.os-block`), `margin-top: 1px` (`.os-check`), `width: 280px` (`.os-card`), `width: 260px` (`.os-block`), `max-width: 420px` (`.os-ritem`, `.os-intent`), `96px/48px` breath circle, `font-size: 14px` cover tagline. Add `space-1-5`, `panel-width: 420px`, use `body-sm` for the tagline.
**Files.** `components/bundle.css`, `Cover/preview.html`, `tokens.json`.

### P2.6 Strike-through on done routine items
`line-through` lowers legibility (Hyperlegible is chosen for low-vision readers). Prefer `ink-muted` text plus the filled check; keep the text readable so the user can re-read what they did.
**Files.** `components/bundle.css` (`.os-ritem-done .os-ritem-label { text-decoration: none; }`).

### P2.7 `TimerRing` and `MenuBarTimer` have no paused or idle state
P1 needs "paused" (the ring dims to `ink-muted` stroke and the chip reads "Paused") and "idle/no session" (menu bar shows the shape only, digits hidden, `aria-label "No session"`). Add `mode: 'paused' | 'idle'` and `.os-timer-paused .prog { stroke: var(--line-strong); }`.
**Files.** `components/bundle.js`, `components/bundle.css`, `components/index.d.ts`.

### P2.8 Shadows in dark: `shadow-raised` dark is a single hard 1px shadow
`0 1px 2px rgba(0,0,0,0.4)` reads as a crisp line under cards, not a lift. Use `0 1px 2px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.30)` to match the light two-layer structure. Also in dark, README should say: "borders separate, shadows barely exist; raise with `surface-raised` rather than shadow."
**Files.** `tokens.json`, `README.md`.

### P2.9 `WellnessNote` icon ring uses `stroke: currentColor` on an `ink-muted` 14px glyph
Fine for contrast (5.5:1 light), but there is no `role`/`aria`; add `role="note"` so VoiceOver groups it, and allow `as="p"` so it can sit alone at the foot of a routine.
**Files.** `components/bundle.js`.

### P2.10 Preview coverage
No preview shows: dark theme side by side, hover/active/disabled, a long task title, a 15-minute `TimeBlock`, `TaskCard` without estimate, or `HabitDots` with "today, done". Add those rows; they are where the next bug of the "invisible break label" class will show up.
**Files.** every `components/<Name>/preview.html`.

---

## Brand book (`README.md`) review

What is good: the five principles map one-to-one to the spec; the colour table and `-soft`/`on-` scheme are easy to implement; the voice section with Do/Don't pairs is the most useful part of the document for a future agent.

What an implementing agent will be missing:
1. **A state matrix.** One table: component × (rest, hover, pressed, focus-visible, disabled, selected, loading, empty) → which token changes. Today only hover is defined, and only for buttons.
2. **Hit targets and control heights.** State "44×44 minimum for anything clicked, 24×24 absolute floor (WCAG 2.2 2.5.8); control heights 28/40/52".
3. **Layout numbers.** Rail width (64px), minimum window (900×600), content max width (720px for Today, 65ch for text), px-per-minute on the calendar (2px/min), column width on Board (280px).
4. **The 2-minute warning as a sequence**, end to end (ring/chip/menu bar/sound/no modal), since it touches five components.
5. **Dialog and overlay rules.** Esc always does the safe thing; focus returns to the trigger; one dialog at a time; `scrim` only behind `IntentPrompt`, full-screen and destructive confirmations.
6. **Number and time formatting.** "0h 52m" vs "52 min" vs "00:52"; 24-hour vs locale; use `timer-*` for countdowns, `os-num` (tabular `body`) for durations and clock times; never show seconds outside the ring.
7. **Notifications.** Where toasts appear (bottom-centre of the window, one at a time), how long, and that macOS system notifications are only used for session end and the 2-minute warning, never for stats.
8. **Explicit "don'ts" for colour.** No `filter`, no `opacity` on text, no `amber` for anything that is not "almost up" or "at limit" (this would have caught P0.4), no `critical` outside the delete-data dialog, no `surface-sunken` on `surface` for marks.
9. **Dark-theme rules beyond "first-class".** Raise with surface steps not shadows; `on-` text is dark; focus ring is lighter in dark; the hatch and tracks use `line`.
10. **Fonts ship locally** (P1.6) and the reading-comfort swap applies to `body`, `body-sm`, `heading`, `title` but never to timer digits.
11. **Naming.** CSS prefix `os-`, mode suffix convention (`os-mode-*`, `os-timer-*`, `os-block-*`), one class per state (`os-card-active`, `os-ritem-done`).

The `design-system.json` `docs.sections` array is empty, so the README is not registered as a doc section; worth wiring so the brand book shows in the artifact.

---

## Cover (`components/Cover/preview.html`)

The composition idea is right (one tall focus slab, a ring motif on a dark slab, lots of air, the name bottom-left). Three issues:
1. **The arcs fail on the ink slab in both themes.** Light: `break` on `ink` 2.38:1, `amber` on `ink` 2.40:1. Dark: `ink` becomes light (`#e3ebe8`) and `break`/`amber` drop to 1.56:1 / 1.53:1; the motif, the "time is always visible" idea, is the least visible thing on the page. Fix: stroke the arcs with the `-soft` tints, which were designed as the complement of `ink` on both sides: `.arc { stroke: var(--focus-soft); }` (already), `.arc.b { stroke: var(--break-soft); }` (12.3:1 / 11.7:1), `.arc.a { stroke: var(--amber-soft); }` (12.4:1 / 11.4:1). The pale arcs on the deep slab also look more "night sky", which suits the brand.
2. **The ink slab is the heaviest element on a calm cover.** A 200×256 near-black rectangle dominates. Either shrink it to 160×232 to match the focus slab, or set it to `var(--focus)` and let the focus slab become `focus-soft`, so the identity hue carries the ring.
3. **Tagline.** 14px is not a token; use `body-sm` (13/18). "Calm time. Deep focus. Kind accountability." is three noun fragments; the brand voice is sentences. Suggest "Calm time, deep focus, kind accountability." or the spec's own line "One calm place for your time." The `.name` at 88px/600 is good; consider weight 500 to feel quieter at that size. The art is `aria-hidden` and the `h1` is present: correct.
4. Minor: `.blk { rx: var(--radius-lg) }` sets a CSS geometry property on SVG rects which Safari supports but older WebKit builds ignore; the `rx="16"` attributes already cover it, so this is harmless but redundant.

---

## Appendix: contrast results (from `review/contrast.py`)

Every text-on-ground pair passes 4.5:1 in both themes. Lowest: light `focus` on `focus-soft` 4.86:1, light `ink-muted` on `focus-soft` 4.91:1, dark `ink-muted` on `focus-soft` 5.53:1. `line-strong` on `surface-sunken` is 3.03:1 light (just passes; it will fail under P2.1's warm shift unless darkened). Fails: `surface-sunken` on `surface` 1.10 / 1.06 (used as a mark, P0.2); `break`/`amber` on `ink` 2.4 / 1.5 (cover). `routine` vs `amber` lightness ratio 1.05 / 1.02 (P1.3).
