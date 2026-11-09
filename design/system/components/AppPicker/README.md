Adds apps to a list without typing names from memory.

- **Anatomy:** a `Dialog` at `panel-width` × `picker-height` (a full-window sheet below 640 × 480). A fixed header with the title and a Close `IconButton`, whose tooltip renders inside the dialog; the search `Input` (`type="search"`, visible label "Search apps", initial focus, ⌘F); scrolling sections: Open now, Used recently (only while recording is on) and All applications; a fixed footer with the `Select` "Add as" (label visible) and the primary "Add N apps" (⌘↩).
- **Privacy variant:** title "Add to never record", footer line "Role stays the same.", primary "Never record N".
- **States:** apps already listed are disabled and say so ("Already Distracting"); keyboard focus rings the whole result row. The ring sits inside the row because the result list scrolls; it is the one place the ring is inset.
- **Keyboard:** ↑/↓ in the results, Space toggles, ⌘↩ adds, Esc closes.

Do: keep the primary in the footer, the one primary in the dialog. Don't: show live foreground-app activity here beyond the "Open now" list.
