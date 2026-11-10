Buttons say what happens when pressed.

- `variant`: `primary` (pill, `focus` fill) is the one main action on a screen, usually "Start focus"; `break` is the main action during a break; `quiet` (default) is a secondary action on `surface-raised`; `ghost` is tertiary or dismissive; `critical` exists only for the confirm button of a delete-data `Dialog`.
- `size: 'lg'` for Start on Today.
- `loading` sets `disabled` and `aria-busy`. Pass the label yourself ("Starting…"); the label never hides.
- Native `disabled` and `aria-disabled="true"` both block activation; the disabled look is a dashed `line-strong` border with full-contrast `ink-muted` text, never opacity.

Do: at most one `primary` per screen. Don't: use `critical` on a card, in a list or anywhere outside a confirmation.
