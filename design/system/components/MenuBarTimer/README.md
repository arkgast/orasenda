Time that is always visible: the menu-bar item and the floating mini timer.

- `compact` (default `true`): `timer-sm` digits plus a mode shape, nothing else; it is also the timer inside `SessionSlot` on planning pages. `compact: false` is composed by `FloatingTimer` (`timer-md` digits, Pause/Resume and Open Orasenda); build the floater from that component.
- `remaining`, `remainingLabel`, `progress` and `mode` as in `TimerRing`. Focus shows a small draining ring; `warning` shows the triangle, `break` the half circle, `paused` the bars, `idle` the hollow circle with no digits.
- `task` is always part of the spoken name, even when compact.

Do: keep it informational (`role="timer"`); the host wraps it in its own menu control. Don't: invent digits when there is no session.

## Menu-bar glyphs

The macOS menu-bar item is a native `NSStatusItem`, which holds an image and a title, not a webview, so it cannot render this component. It mirrors the compact form instead: a template image for the mode and the `remaining` digits as the title. The React component is used for the floating mini timer.

| Mode | Glyph | Title |
| --- | --- | --- |
| `focus` | filled circle | `remaining` |
| `paused` | two vertical bars | `remaining`, frozen |
| `idle` | hollow circle | none: no digits without a session |
| `warning` (later) | triangle | `remaining` |
| `break` (later) | half circle | `remaining` |

- The first focus-session release draws `focus`, `paused` and `idle`; `warning` and `break` come with breaks and the two-minute warning.
- Glyphs are **template images**: black with alpha only, so macOS tints them for the light and dark menu bar, the selected state and Increase Contrast. Never colour them; the mode is told by the shape, never by hue.
- `focus` uses the static filled circle from the mode shapes, not the component's draining ring: a template image does not animate, and the digits carry the progress.
- Size: an 18×18 pt canvas, shipped as one 36×36 px image (`tray-icon` sizes the image to 18 pt high). The shape fills the centre 14×14 pt (28×28 px), matching `icon-md` beside the digits; the hollow circle's stroke is 1.5/10 of the shape (about 4 px in the asset), as in the component.
- The title is plain text in the system menu-bar font. Orasenda does not restyle it, so its digits are not tabular and the title's width can shift slightly as it counts.
- VoiceOver: the item's accessibility label is prefixed "Orasenda," and repeats the component's spoken name: the mode word and `remainingLabel` ("Orasenda, Focus, 24 minutes 59 seconds remaining", "Orasenda, Paused, …"), or "Orasenda, No session" when idle. For VoiceOver the glyph alone never carries the mode.

## Menu content

The menu has no chip, so a disabled header line carries the state word. Minutes left are rounded up (ceil): 18:42 reads "19 minutes left", 01:48 reads "2 minutes left".

| State | Header line (disabled) |
| --- | --- |
| idle | "No session" |
| running | "Focus · 19 minutes left · ends 15:20" (at 18:42); "Almost up · 2 minutes left · ends 15:20" (at 01:48) |
| paused | "Paused · 19 minutes left" (at 18:42) |

- In every state the menu shows ⌃⌥F as inert text, a Full screen submenu with one item per display, and "Hide floating timer" as a toggle.
- Commands live in this native menu, never in a webview popover.
