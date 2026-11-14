import { type ReactElement, type ReactNode, useId } from "react";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";
import { IconButton } from "./icon-button";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-aligned with tabular digits (sizes, counts). */
  numeric?: boolean;
}

export interface DataTableAction {
  /** The accessible name and tooltip, naming the row ("Edit Steady Focus"). */
  label: string;
  icon: IconName;
  onSelect: () => void;
  disabled?: boolean;
  /** A line under the row that says why (a disabled action keeps its tooltip). A row shows one reason, shared by all its disabled actions. */
  reason?: string;
  /** An id for the button, so a host can find it. */
  id?: string;
  /** Sets aria-expanded: the action opens a detail panel under the row. */
  expanded?: boolean;
  /** Sets aria-controls: the id of that panel. */
  controls?: string;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** A leading cell, such as a radio that picks the row. `header` is its (visually hidden) column name. */
  selection?: { header: string; cell: (row: Row) => ReactNode };
  actions?: (row: Row) => DataTableAction[];
  /** A panel under a row, across the full width (an inline editor). Null shows none. */
  detail?: (row: Row) => ReactNode;
  /** One line under the rows ("3 backups, 921 KB"). */
  footer?: ReactNode;
  /** Shown in place of the rows when there are none. */
  empty: ReactNode;
}

const CELL = "px-2 py-2 text-start align-middle text-body-sm text-ink wrap-anywhere";

/** A ruled table: a caption, a header row, hairline rows, and IconButton actions at the row end. */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  selection,
  actions,
  detail,
  footer,
  empty,
}: DataTableProps<Row>): ReactElement {
  const reasonBase = useId();
  const span = columns.length + (selection ? 1 : 0) + (actions ? 1 : 0);
  return (
    <div className="@container w-full min-w-0">
      <table data-slot="data-table" className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong">
            {selection ? (
              <th scope="col" className="w-px px-2 py-2">
                <span className="sr-only">{selection.header}</span>
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-2 py-2 text-label uppercase text-ink-muted wrap-anywhere @md:wrap-normal @md:whitespace-nowrap",
                  c.numeric ? "text-end" : "text-start",
                )}
              >
                {c.header}
              </th>
            ))}
            {actions ? (
              <th scope="col" className="w-px px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        {rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={span} className="px-2 py-4">
                {empty}
              </td>
            </tr>
          </tbody>
        ) : (
          rows.map((row, index) => {
            const list = actions?.(row) ?? [];
            const detailNode = detail?.(row);
            const reasonId = `${reasonBase}-${index}`;
            const reason = list.find((a) => a.disabled && a.reason)?.reason;
            return (
              <tbody key={rowKey(row)} className="border-b border-line">
                <tr>
                  {selection ? <td className={cn(CELL, "w-px")}>{selection.cell(row)}</td> : null}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      data-numeric={c.numeric ? "true" : undefined}
                      className={cn(CELL, c.numeric ? "text-end tabular-nums @md:wrap-normal" : "")}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {actions ? (
                    <td className={cn(CELL, "w-px whitespace-nowrap")}>
                      <span className="flex justify-end gap-1">
                        {list.map((a) => (
                          <IconButton
                            key={a.label}
                            label={a.label}
                            icon={<Icon name={a.icon} />}
                            disabled={a.disabled}
                            onClick={a.onSelect}
                            id={a.id}
                            aria-expanded={a.expanded}
                            aria-controls={a.controls}
                            aria-describedby={a.disabled && a.reason ? reasonId : undefined}
                          />
                        ))}
                      </span>
                    </td>
                  ) : null}
                </tr>
                {detailNode ? (
                  <tr>
                    <td colSpan={span} className="px-2 pb-2">
                      {detailNode}
                    </td>
                  </tr>
                ) : null}
                {reason ? (
                  <tr>
                    <td
                      colSpan={span}
                      id={reasonId}
                      className="px-2 pb-2 text-body-sm text-ink-muted"
                    >
                      {reason}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            );
          })
        )}
        {footer ? (
          <tfoot>
            <tr>
              <td colSpan={span} className="px-2 py-2 text-caption text-ink-muted">
                {footer}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
