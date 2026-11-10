Records the global shortcut that starts or pauses focus from anywhere.

- **Anatomy:** a field-like `button` on `surface-sunken` with a `line-strong` border, at least `field-width` wide; the keys in mono (`aria-hidden`) plus a hidden span with the keys in words; the visible hint "Change".
- **States:** rest; recording (`selection` ground, `focus` border, hint "Type the new keys, Esc cancels"); conflict (the `Input` thick border plus an alert-glyph line "Orasenda uses ⌘K for Commands. Pick a different one."); off.
- **Keyboard:** Return or Space starts recording; Esc cancels; ⌫ turns the shortcut off; "Use ⌃⌥F" restores the default. A shortcut needs ⌘, ⌃ or ⌥ plus a key.
- **VoiceOver:** no `aria-label` and no `aria-invalid`. The name comes from `aria-labelledby`: row label + spoken keys + hint ("Start or pause focus from anywhere, Control Option F, Change"). The conflict, VoiceOver and off lines and the helper are linked with `aria-describedby`.
- The All shortcuts table caps at `panel-width`.

Do: name the clash and what to do. Don't: accept a single letter without a modifier.
