Time that is always visible: the menu-bar item and the floating mini timer.

- `compact` (default `true`): digits plus a mode shape, nothing else; the menu bar has no room for a task. `compact: false` is the floating window: `timer-md` digits and the task.
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
- Glyphs are **template images**: black with alpha only, so macOS tints them for the light and dark menu bar, the selected state and Increase Contrast. Never colour them; the mode is told by the shape and the title, never by hue.
- Size: 18×18 pt, shipped as one 36×36 px image (the menu bar scales it to 18 pt). Shapes keep the proportions and stroke of the component's mode shapes.
- The title uses the system menu-bar font with tabular digits; Orasenda does not restyle it.
