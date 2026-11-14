A ruled table for a short list of records with actions at the row end: the Timer pane's presets and the Backups list.

- **Anatomy:** a native `table` with a `caption`, a header row (`label` caps, `ink-muted`, `scope="col"`), one `tbody` per row with a hairline `line` rule, an optional footer line (`caption`, `ink-muted`: the count and total size) and, when there are no rows, the `empty` slot in place of the rows. The caption is the table's accessible name and is visually hidden: the pane's own heading is the visible title.
- **Props:** `caption`; `columns: { key, header, cell(row), numeric? }[]`; `rows`; `rowKey(row)`; `selection?: { header, cell(row) }`; `actions?: (row) => { label, icon, onSelect, disabled?, reason? }[]`; `footer?`; `empty` (an `EmptyState` with `variant="inline"`, or another node).
- **Selection:** a leading cell for a control that picks the row (a radio). The presets put their radio (`Choice`, the preset's name as its label, no description) in the Name cell instead, which needs no selection cell; the Timer pane wraps the table in a `ChoiceGroup`. `header` is the cell's column name for VoiceOver and is not drawn.
- **Row actions:** each is an `IconButton` (`hit-min` target) with its built-in Tooltip. `label` names the row ("Edit Steady Focus", "Delete the backup from 3 November 2026, 09:12"); `icon` is an `Icon` name (`edit`, `delete`, `restore`, `close` for Remove). The actions sit right-aligned in the last column and are not shrunk.
- **Row detail:** `detail(row)` returns a panel (an inline editor) shown in a full-width row right under that row; null shows none. An action that opens it sets `expanded` (aria-expanded) and `controls` (the panel's id); `id` names the button for a host that must return focus to it.
- **Wrapping:** headers stay on one line, and numeric cells break only between words once the table is 28rem wide or more; below it they may break inside a word so the table fits.
- **Disabled action:** keeps its Tooltip and its dashed edge. With `reason`, one line per row (shared by all that row's disabled actions) under the row ("From a newer Orasenda", `body-sm` `ink-muted`) says why, and the button's `aria-describedby` points at it, so the reason is a word and not only a dashed edge.
- **Selection control:** it must meet `hit-min` (use `Choice`, whose label is the target), never a bare input.
- **Narrow widths:** header and cells wrap anywhere; actions sit `space-1` apart. The five-column presets table (Name, Focus, Break, Long break, Rounds) wraps its headers and fits 360 wide with no sideways scroll.
- **Numeric columns:** `numeric` aligns the header and cells to the end with tabular digits.
- **Wrapping:** text wraps anywhere, even a long word, and is never truncated. With 1 or 12 rows there is no sideways scroll at 360 wide.
- **Not here:** sorting, paging, filtering, row selection state, column resizing.
- **Keyboard:** Tab reaches each enabled action in row order; the host's radios follow their own arrow-key rules.
- **VoiceOver:** the table is read with its caption, rows and column headers; each button is named by `label`.

Do: name each action with the row it acts on. Don't: show an action as an icon with no tooltip, or leave a disabled action without a reason.
