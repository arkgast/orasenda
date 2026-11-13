A key name inline in a tip, a tooltip or a caption.

- **Anatomy:** the `kbd` type style (mono 12/16), `ink` text on `surface-raised`, a 1px `line-strong` edge, `radius-sm`, padding `0 space-1`. It never wraps.
- **Props:** `keys` (the canonical glyph string, "⌃⌥F"), `spoken` (required in running text: "Control-Option-F", "Command-Return", "F key") and `inTooltip` (inside a `Tooltip`, or where a parent speaks the whole chord once, as `ShortcutList` does; then `spoken` is optional). Fill `spoken` with `describeShortcut(keys).spoken`.
- **States:** none; it is never a control.
- **VoiceOver:** the glyph is `aria-hidden`. In running text a visually hidden sibling carries `spoken`; in a tooltip the trigger's `aria-keyshortcuts` speaks it. No live region.
- **Single keys:** a `Kbd` for Space, F or P appears only while the Single-key shortcuts setting is on.
- Replaces the ad hoc `sp-kbd`, `ob-kbd` and `hz-tip kbd` styles.

Do: always pass a spoken name in text. Don't: style a Kbd as a button or make it focusable.

## Shortcut glyphs

Every shortcut in the app is one canonical glyph string: the modifiers in macOS order, each at most once, then exactly one key. `describeShortcut(glyphs)` (exported with the components) turns it into the `aria-keyshortcuts` form and the spoken words. `IconButton` uses it for `aria-keyshortcuts`; hosts use it for a `Kbd`'s `spoken` and a palette command's shortcut; `ShortcutRecorder` emits only these strings. Text forms such as `Cmd+.` are not accepted.

| Glyph | `aria` | `spoken` |
| --- | --- | --- |
| `⌃` (modifier) | `Control` | Control |
| `⌥` (modifier) | `Alt` | Option |
| `⇧` (modifier) | `Shift` | Shift |
| `⌘` (modifier) | `Meta` | Command |
| `A` to `Z` (capitals) | the letter | the letter; alone, "F key" |
| `0` to `9` | the digit | the digit; alone, "7 key" |
| `.` | `Period` | Period |
| `,` | `Comma` | Comma |
| `↩` | `Enter` | Return |
| `Space` | `Space` | Space |
| `Esc` | `Escape` | Escape |
| `⌫` | `Backspace` | Delete |
| `←` `↑` `→` `↓` | `ArrowLeft` `ArrowUp` `ArrowRight` `ArrowDown` | Left Arrow, Up Arrow, Right Arrow, Down Arrow |
| `Tab` | `Tab` | Tab |

The parts join with `+` in `aria` and `-` in `spoken`, modifiers first in the order `⌃⌥⇧⌘`:
- `⌃⌥F` gives `{ aria: "Control+Alt+F", spoken: "Control-Option-F" }`.
- `⌘.` gives `{ aria: "Meta+Period", spoken: "Command-Period" }`.
- `⇧⌘P` gives `{ aria: "Shift+Meta+P", spoken: "Shift-Command-P" }`.
- `Space` gives `{ aria: "Space", spoken: "Space" }`.

**Unknown strings.** A lowercase letter, a modifier out of order or twice, a missing key or any key not in the table is unknown. When `window.Orasenda.strictShortcuts` is `true`, `describeShortcut` throws, naming the string. Otherwise it returns `{ aria: glyphs, spoken: glyphs }` unchanged and logs one `console.warn` per call. `bundle.js` is a plain script with no build step, so it cannot see `NODE_ENV`; the flag sits on the namespace instead and is read at every call, so a host can set it before or after `bundle.js` runs. Tests and the specimens set it to `true`; the app leaves it unset.

Windows: P1 has Mac glyphs only. When Windows UI arrives the table gains a platform argument; the function's name and return shape stay.
