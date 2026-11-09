The one primary action on Today: "Start focus" with the play glyph, and "Just 2 minutes" beside it as the quiet secondary.

- **Why "Just 2 minutes" stays visible at every size:** starting is the hardest step for many people, and especially with ADHD. A two-minute session is small enough to say yes to without planning, and once started most people keep going. It is the quiet secondary beside Start, never a second primary.
- `onStart` and `onQuickStart`. Start carries the play glyph, the only control that does (with the floater's Start pill). The finish time lives in the preset summary above ("Classic · ends 15:20"), not under the button.
- `compactLabel`: below 400px of content the visible label is "Start"; the accessible name stays "Start focus".
- `loading` ("Starting…") and `unavailable` both guard Start and Just 2 minutes. `unavailable` pairs with a status-row line ("Focus didn't start. Orasenda's timer isn't responding." and Try again).
- `aria-keyshortcuts="Space Meta+Enter"` on Start only (Space only while single-key shortcuts are on).

Do: keep this the only `primary` on the screen. Don't: put a second Start anywhere else on Today, or hide Just 2 minutes in small windows.
