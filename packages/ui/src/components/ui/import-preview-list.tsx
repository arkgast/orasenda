import { type JSX, type Ref, useId, useRef } from "react";
import { setRef } from "../../lib/set-ref";
import { useRoving } from "../../lib/use-roving";
import { Button } from "./button";
import { Choice } from "./choice";

export interface ImportPreviewItem {
  key: string;
  title: string;
  /** A quiet line: due date, project, tags. */
  meta?: string;
  /** Why the task needs a look ("Already on the Board, in Today"); shown in ink. */
  why?: string;
  checked: boolean;
}

export interface ImportPreviewListProps {
  /** Names the group of rows. */
  label: string;
  items: ImportPreviewItem[];
  onToggle: (key: string) => void;
  onSetAll: (checked: boolean) => void;
  /** Plain lines under the count ("Showing 500 of 812 tasks."). */
  summary?: string[];
  /** The checkbox that holds the tab stop; pass it to Dialog's initialFocusRef. */
  ref?: Ref<HTMLElement>;
}

function describedBy(entry: ImportPreviewItem, meta: string, why: string): string | undefined {
  const ids = [entry.meta ? meta : "", entry.why ? why : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** The import sheet's preview: a count line, Select all or none, then a checkbox row per task. */
export function ImportPreviewList({
  label,
  items,
  onToggle,
  onSetAll,
  summary,
  ref: focusRef,
}: ImportPreviewListProps): JSX.Element {
  const id = useId();
  const ref = useRef<HTMLFieldSetElement>(null);
  const { item, active } = useRoving(ref, items.length);
  const selected = items.filter((i) => i.checked).length;
  const all = items.length > 0 && selected === items.length;
  return (
    <div data-slot="import-preview-list" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-body-sm text-ink">{`${selected} of ${items.length} selected`}</p>
        {items.length > 0 ? (
          <Button onClick={() => onSetAll(!all)}>{all ? "Select none" : "Select all"}</Button>
        ) : null}
      </div>
      {summary?.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines can repeat, so the line alone is not a key
        <p key={`${index}-${line}`} className="m-0 text-body-sm text-ink-muted">
          {line}
        </p>
      ))}
      <fieldset
        ref={ref}
        aria-label={label}
        className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      >
        {items.map((entry, index) => {
          const title = `${id}-${index}-t`;
          const meta = `${id}-${index}-m`;
          const why = `${id}-${index}-w`;
          return (
            <Choice
              key={entry.key}
              type="checkbox"
              long
              checked={entry.checked}
              onChange={() => onToggle(entry.key)}
              aria-labelledby={title}
              aria-describedby={describedBy(entry, meta, why)}
              {...item(index)}
              ref={index === active ? (el) => setRef(focusRef, el) : undefined}
              description={
                entry.meta || entry.why ? (
                  <>
                    {entry.meta ? (
                      <span id={meta} className="block">
                        {entry.meta}
                      </span>
                    ) : null}
                    {entry.why ? (
                      <span id={why} className="block text-ink">
                        {entry.why}
                      </span>
                    ) : null}
                  </>
                ) : undefined
              }
            >
              <span id={title}>{entry.title}</span>
            </Choice>
          );
        })}
      </fieldset>
    </div>
  );
}
