A duration shown as a bar, in Review and in session summaries.

- **Anatomy:** a grid row of three content-sized columns (subgrid): the label (glyph or shape plus word), a `bar-height` pill filled with `line-strong` and scaled to the largest value in the list, and the duration in `timer-sm` ("0h 35m"). Row height `control-sm`. No track.
- **Goal variant:** the only bar with a track (a `line` hairline, decorative) and the only one filled with `focus`, because it measures Focus sessions. It scales to the goal, not to the list. The goal tick is two 2 × 6px `ink` stubs above and below the track, never across the fill, with the words "Goal 12h". A value past the goal fills the whole track and the words carry it ("Goal 12h, reached"); the bar never extends beyond the track.
- **VoiceOver:** a list item, never focused: "Focus, 2 hours 10 minutes".
- **Contrast:** `line-strong` on `surface` 4.35 / 5.56 and on `surface-raised` 4.79 / 4.99; `focus` on `surface` 5.31 / 8.74.

Do: let the words say the goal. Don't: show percentages or ratios, colour a bar about apps, or colour the track.
