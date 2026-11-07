# Orasenda design system: final notes

Final round over Codex's implementation of the review. Everything below was edited in place in `project/`. The pre-Codex copy in `../ds/project/` was not touched.

## Verdict on Codex's work

The component work is good and was kept: the 13 new components, the native-dialog shell with safe Escape and focus restoration, the draining ring, the controlled `RoutineItem`, the neutral over-estimate dots, the compact calendar blocks, the IME guard in the palette and the capture pad that never discards text. Its two corrections to the review were right and stand: `line-strong` (not `line`) for marks that carry meaning, and full-contrast disabled buttons instead of 45% opacity.

What needed fixing was around the components rather than in them: the token file had grown a layer of machinery, the previews carried 24 copies of the palette, and the brand book had become a wall of rules.

## What changed on top of Codex, and why

**tokens.json**
- `type.fonts` is now empty. There are no font files under `project/fonts/`, so declaring the three faces there was against the token contract; the families and the licence note (SIL OFL 1.1, Braille Institute and Lexend) live in the README's font rule instead.
- Removed the `typography` family (35 tokens). `font-sans`, `font-mono` and `font-alt` collided with the names the host already generates from `type.families`; the `*-size`, `*-leading`, `weight-*` and `tracking-*` tokens duplicated `type.groups`, which is the source of truth. The CSS now carries the px values with a comment pointing at the type scale, as the original did.
- Trimmed `size` from 23 to 15 tokens. Component geometry that is not a brand decision (breath circle, dot and check sizes, menu task width, block width, `control-md`, `text-width`) is inlined in CSS. The layout constants the README quotes stay (rail, window minimum, content and column widths, panel width, timer sizes, icon sizes, hit sizes).
- Removed `on-routine` and `on-amber`: no component has a solid routine or amber fill, and an amber button would be off-philosophy.
- Rewrote every `usage` string. Codex's were generated boilerplate ("Use for control or layout dimensions: control-sm; text uses ink/ink-muted...") on all non-colour families. Each now says where the token goes and what sits on it.
- Spacing is ordered `space-1`, `space-1-5`, `space-2`…; nothing else about the colour values changed. The palette Codex and the review settled on (warm light surfaces, muted sand routine, darker `line-strong`, hover/pressed fills, critical family, overlay, selection, clear) is kept as is.

**bundle.css**
- Type sizes, weights and structural geometry inlined (see above). Every remaining `var()` resolves to a token or a generated font family.
- Removed the `aria-pressed` double-border rule (nothing uses it) and the 3px double border on invalid fields (it shifted layout); an invalid field now thickens its border with an inset shadow and shows the glyph and text.
- `.os-command-list` no longer borrows `--timer-size` for its max height.
- `.os-menubar-task` uses `--font-sans` explicitly rather than inheriting mono from the timer.
- `.os-note`, `.os-empty p` and `.os-kanban > p` reset margins so they sit cleanly in stacks.
- Reduce-motion stays as Codex set it (all animation and transition removed, breath static at scale 1). It is simpler than the review's "keep opacity fades", the README matches it, and nothing in the spec needs a fade.

**bundle.js and index.d.ts**
- Removed `TimerRing.fill` (the spec wants a remaining arc; an elapsed option invites the wrong screen) and `digitSize` (digits already scale with the container).
- `HabitDots` no longer accepts the legacy `'missed'` and `'today'` strings; nothing has shipped, so there is nothing to migrate. Bare state strings still work. Unknown states fall back to `future` rather than throwing.
- `Dialog` lost `confirmDisabled` (a host that cannot confirm yet should not open the dialog) and its default cancel label is "Cancel" instead of "Keep going".
- `FullScreenFocus` passes only timer props to the ring instead of spreading its whole prop bag.
- Field errors no longer start with "Check:"; the glyph and the sentence are enough. The palette title is "Commands". `aria-busy` is only set when loading.

**Previews (23 files)**
- Regenerated from one template. Each is a single column that uses the host's injected tokens; the duplicated light and dark hex maps and the six unused `useState` hooks are gone. Dark is covered by the contrast script and by the host's theme switch, and the palette can no longer drift between tokens and previews. Card heights were halved accordingly.
- Copy was tidied: feedback lines say what happened ("Opened the chapter 3 task.") instead of "Action received. This preview keeps your place."; the deep-hours notice says "A pause now will keep tomorrow good."; the full-screen and dialog examples keep their honest wording.
- Modal previews keep enough card height for the native dialog to centre without clipping. The Cover is unchanged apart from two px values that replaced removed tokens.

**Component READMEs (23 files)**
- Rewritten from Codex's one-paragraph "Provide…; do not…" form into a short purpose line, a props list and a Do / Don't pair, matching the original voice.

**README.md (brand book)**
- Restored the original's readable structure (Principles, Colour, Type, Layout, States, Motion, Dialogs, Voice, Iconography, Accessibility) and folded in the review's requests that earn their place: the state table (reduced to the three columns that actually change), hit targets and layout numbers, number formats, the two-minute sequence, dialog and notification rules, the colour don'ts, dark-theme rules, the local-fonts rule, class naming. The Voice Do / Don't pairs are back.

## Decisions on deferred, rejected and double-check items

| Item | Decision |
| --- | --- |
| P1.6 fonts | `type.fonts` empty; families declared; README states fonts ship in the bundle and the preview `@import` must not ship. Bundling is implementation work. |
| P1.7 reduced motion | Codex's stricter rule kept (nothing moves, nothing fades). |
| P1.11 bypass reason | Optional in Gentle mode, as Codex argued; stricter modes are a user choice. |
| P2.4 ChipToggle | Not added. Native radios with 44px labels (`CapturePad`, `IntentPrompt`) cover exclusive choices. |
| P2.10 dark side by side | Reversed. Host theming replaces hardcoded palettes in previews. |
| Brand-book registration in `design-system.json` | Left alone; the file is pre-existing and out of scope. |
| Codex double-check 1 (render in the host) | Not possible here; see open items. |
| Double-check 2 (native WebKit modality, VoiceOver, IME) | Not possible here; the markup is standard `<dialog>` + `showModal()`. Open item. |
| Double-check 3 (token host format) | Families are list-shaped, names unique, no `motion`, `type.fonts` empty; the preview palettes that needed regenerating are gone. |
| Double-check 4 and 5 (host wiring and changed defaults) | Documented in the component READMEs and the brand book. |
| Double-check 6 (bundle fonts) | README rule; open item. |
| Double-check 7 (forced colours, one primary per screen) | Forced-colours block kept; the catalog shows several primaries by design. |

## Final component list (23)

Actions: Button, StartButton. Foundations: ModeChip. Timer: TimerRing, MenuBarTimer, FullScreenFocus. Tasks: TaskCard, KanbanColumn. Calendar: TimeBlock, NowLine. Routines: HabitDots, RoutineItem, WellnessNote. Focus protection: IntentPrompt. Overlays: Dialog. Fields: Input, TextArea. Capture: CapturePad. Feedback: InlineNotice, Toast, EmptyState. Navigation: NavRail, CommandPalette. Plus the Brand cover.

## Verification results

- `bundle.js` parses as a classic script (`vm.createScript`). Every preview's inline script parses.
- Line 1 of `bundle.js` is the `@ds-bundle` header (format 4, namespace Orasenda) and lists exactly the 23 exported names, in order; `index.d.ts` declares each one.
- Every component folder except Cover has `README.md` and `preview.html`; every preview's first line is `<!-- @dsCard group="…" height=N -->`.
- Every `var(--x)` in `bundle.css` and the 24 previews is a generated name (66 tokens plus `--font-sans`, `--font-mono`, `--font-alt`).
- `tokens.json`: families are `{tokens:[{name,value,usage}]}` (colour also has light-then-dark `themes`); values are hex, rgba or `{alias}`; names unique; no `motion` family; `type` has `fonts` (empty), `families`, `groups`. No `tokens.css` or `manifest.json`; `design-system.json` untouched.
- Contrast, 106 pairs per theme (`verification/contrast.py`), all passing. Worst text: light `ink-muted` on `critical-soft` 4.76:1, `focus` on `surface-sunken` 4.77:1; dark `ink-muted` on `focus-soft`/`selection` 5.53:1. Worst marks: light `line-strong` on `critical-soft` 3.86:1, on `surface-sunken` 3.90:1; dark `line-strong` on `focus-soft` 4.09:1. Cover arcs on the ink slab are 11:1 or better.
- Not run: Codex's `dom.cjs` (no jsdom or react-dom available offline), `tsc` on `index.d.ts` (no `@types/react` cached), any browser render. The JS edits were small and re-read by hand; `dom.cjs` was updated for the two assertions they touch.

## Open items for the implementation phase

1. Render every preview in the design-system host in both themes; check the 560px ring, compact blocks, long titles and 200% text. Switch the host theme to dark since previews no longer carry their own palette.
2. Bundle the three OFL font files in the app and drop the `@import` from the shipped CSS; `type.fonts` can then list them.
3. Verify native `<dialog>` behaviour on the target macOS WebKit: Tab containment, inert background, Escape routing, focus restoration, VoiceOver naming; test Japanese and Chinese composition in the palette.
4. Run `dom.cjs`, `tsc --strict` on `index.d.ts` and the Playwright harness with installed React 18, jsdom and `@types/react`.
5. Host responsibilities the components deliberately leave open: freezing `progress` while paused, scheduling the two-minute cue and chime once, honouring reduce-motion and sound settings, keeping capture notes and bypass reasons local and deletable, keyboard move and reschedule in the card and block editors, native full-screen exit after confirmation, and the Toast expiry policy.
6. An icon set for the rail and future screens; the current rail icons are placeholders at the right stroke and size.
