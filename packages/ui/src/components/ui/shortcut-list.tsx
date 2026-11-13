import type { JSX } from "react";
import { Kbd } from "./kbd";

export interface ShortcutListItem {
  action: string;
  /** Canonical glyph strings separated by spaces, one Kbd each ("⌘K", "Space F P"). */
  keys: string;
  /** All the keys in words ("Command-K"). The host fills it from describeShortcut(...).spoken. */
  spokenKeys: string;
  /** The shortcut is not live right now (a single key while single keys are off). The row shows the word "Off". */
  off?: boolean;
}

export interface ShortcutListProps {
  items: ShortcutListItem[];
}

/** A read-only table of every shortcut: the action, then its keys. Never wider than panel-width. */
export function ShortcutList({ items }: ShortcutListProps): JSX.Element {
  return (
    <table
      data-slot="shortcut-list"
      className="w-full max-w-panel-width border-collapse text-start text-body"
    >
      <caption className="sr-only">All shortcuts</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Action</th>
          <th scope="col">Keys</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={`${item.action}|${item.keys}`}
            data-slot="shortcut-list-row"
            data-off={item.off ? "true" : undefined}
            className="border-b border-line align-baseline"
          >
            <th scope="row" className="min-w-0 py-2 pe-3 text-start font-normal text-ink">
              {item.action}
            </th>
            <td className="py-2 text-end">
              <span className="inline-flex flex-wrap items-baseline justify-end gap-1">
                {item.keys.split(" ").map((key, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered chord list
                  <Kbd key={`${key}-${index}`} keys={key} inTooltip />
                ))}
                {item.off ? (
                  <span data-slot="shortcut-list-off" className="ms-1 text-body-sm text-ink-muted">
                    Off
                  </span>
                ) : null}
              </span>
              <span className="sr-only">
                {item.off ? `${item.spokenKeys}, Off` : item.spokenKeys}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
