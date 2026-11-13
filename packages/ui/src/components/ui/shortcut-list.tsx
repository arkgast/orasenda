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
      <thead>
        <tr>
          <th scope="col" className="p-0">
            <span className="sr-only">Action</span>
          </th>
          <th scope="col" className="p-0">
            <span className="sr-only">Keys</span>
          </th>
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
              <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap">
                {item.keys.split(" ").map((key, index) => (
                  // inTooltip only drops the per-key spoken span: the row's sr-only span below speaks all the keys once.
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered chord list
                  <Kbd key={`${key}-${index}`} keys={key} inTooltip />
                ))}
                {item.off ? (
                  <span
                    data-slot="shortcut-list-off"
                    aria-hidden="true"
                    className="ms-1 text-body-sm text-ink-muted"
                  >
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
