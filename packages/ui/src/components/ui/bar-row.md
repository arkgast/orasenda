A duration shown as a bar, in Review and in session summaries.

- **Anatomy:** a grid row of three columns (subgrid), the label content-sized up to 40% of the row (it wraps, never truncates), the bar taking the rest, the duration content-sized: the label (glyph or shape plus word), a `bar-height` pill filled with `line-strong` and scaled to the largest value in the list, and the duration in `timer-sm` ("0h 35m"). Row height `control-sm`. No track.
- **Goal variant:** the only bar with a track (a `line` hairline, decorative) and the only one filled with `focus`, because it measures Focus sessions. It scales to the goal, not to the list. The goal tick is two 2 × 6px `ink` stubs above and below the track, never across the fill, centred on the track. The words ("Goal 12h") are a caption-size line under the track, inside the bar column, so the track length never depends on the copy; the third column keeps the duration, and a goal row may be two lines tall. The exception is `goalWords="end"` (the Week goal row in Review Stats): the words take the third column, in `body-sm` `ink` (the row is `body-sm` too), in place of the duration, so the track shortens by the words' width; nothing is drawn under the track and the row is one line. The host's `spoken` still says the duration and the goal. A value past the goal fills the whole track and the words carry it ("Goal 12h, reached"); the bar never extends beyond the track.
- **Vertical form:** `TrendBars` is the vertical form of the same marks (`line-strong` fill, `ink` goal stubs); the goal variant's `focus` fill stays BarRow-only.
- **VoiceOver:** a list item, never focused: "Focus, 2 hours 10 minutes".
- **Contrast:** `line-strong` on `surface` 4.35 / 5.56 and on `surface-raised` 4.79 / 4.99; `focus` on `surface` 5.31 / 8.74 and on `surface-raised` 5.85 / 7.85.

Do: let the words say the goal. Don't: show percentages or ratios, colour a bar about apps, or colour the track.

**Using it:** put the rows in `BarList`, which is the one place the column template lives, as an inline style (app code never writes a template); each row spans the three columns with a subgrid. The goal words (`goal.words`) are shown verbatim under the goal bar and come from the service; the component composes no words. The rows are read as `spoken`; their content is hidden from the screen reader so nothing is said twice.

`goalWords` is `"under"` by default; `"end"` is ignored without a `goal`. With `"end"` the duration is not drawn, so `spoken` must carry both the duration and the goal.
