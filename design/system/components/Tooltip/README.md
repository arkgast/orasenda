The visible name of an `IconButton` or of the preset summary, shown on hover and on keyboard focus.

- **Anatomy:** a `surface-overlay` panel with a 1px `line-strong` edge, `radius-sm`, `body-sm` `ink` text and an optional `Kbd`. It renders inside the nearest open dialog when its trigger is in one (a `showModal()` dialog sits in the top layer, which no z-index reaches); `z-popover` applies only outside the top layer.
- **Props:** `label`, `shortcut?`, `placement` (auto, never covering the trigger).
- **Single keys:** a `Kbd` for a single key (Space, F, P) shows only while the Single-key shortcuts setting is on. When it is off the tooltip drops that `Kbd` and the trigger drops that key from `aria-keyshortcuts`, keeping any ⌘ combination. The preset summary's tooltip reads "Change preset", with the P `Kbd` only while the setting is on. Tips and captions follow the same rule.
- **Behaviour:** opens after `duration-quick` on hover. Opens on focus only after the window has seen a keyboard event (an input-modality flag), because WebKit matches `:focus-visible` for programmatic focus; this keeps launch focus on Start from opening its tooltip. Stays while hovered (WCAG 1.4.13). At most 40ch wide and two lines, never ellipsized; the `Kbd` never breaks. No motion under reduced motion.
- **Keyboard:** Esc hides it without moving focus, and does nothing else on that press.
- **VoiceOver:** the trigger's name already says the label, so the tooltip is `aria-hidden` and its `Kbd` glyph too. If device testing shows WKWebView does not speak `aria-keyshortcuts`, give the tooltip's `Kbd` the same hidden spoken name as a tip's `Kbd`.

Do: keep the text equal to the accessible name. Don't: put actions or links in a tooltip, or use the native `title` attribute.
