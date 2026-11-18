Buttons say what happens when pressed.

- `variant`: `primary` (`focus` fill) is the one main action on a screen, usually "Start focus"; `break` is the main action during a break; `quiet` (default) is a secondary action on `surface-raised`; `ghost` is tertiary or dismissive; `inline` is a link-like action that sits at the end of a row of text (`text-focus` on a clear ground, `surface-sunken` on hover, `selection` when pressed); `critical` exists only for the confirm button of a delete-data `Dialog`.
- `size`: `md` (default); `lg` for Start on Today; `row` for an action beside a line of text: it adds `flex-none` (the base `px-fluid-stack` padding stays) so the button keeps its width beside the text.
- `loading` sets `disabled` and `aria-busy`. Pass the label yourself ("Starting…"); the label never hides.
- Native `disabled` and `aria-disabled="true"` both block activation; the disabled look is a dashed `line-strong` border with full-contrast `ink-muted` text, never opacity.

Do: at most one `primary` per screen. Don't: use `critical` on a card, in a list or anywhere outside a confirmation.
