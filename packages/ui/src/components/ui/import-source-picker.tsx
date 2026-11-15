import { type JSX, type Ref, useId, useRef } from "react";
import { setRef } from "../../lib/set-ref";
import { useRoving } from "../../lib/use-roving";

export interface ImportSource {
  kind: string;
  name: string;
  description: string;
  /** Why the source cannot be used now, in words; the row stays and keeps this visible. */
  disabledReason?: string;
}

export interface ImportSourcePickerProps {
  sources: ImportSource[];
  /** The kind being read: that row shows "Reading…" and is busy. */
  reading?: string;
  onPick: (kind: string) => void;
  /** The row that holds the tab stop; pass it to Dialog's initialFocusRef. */
  ref?: Ref<HTMLElement>;
}

const ROW =
  "flex min-h-hit-min w-full cursor-pointer flex-col items-start gap-1 rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-start text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-disabled:cursor-default aria-disabled:border-dashed aria-disabled:bg-surface-sunken aria-busy:cursor-progress";

/** The import sheet's first step: one bordered row per source, one tab stop, Up and Down to move. */
export function ImportSourcePicker({
  sources,
  reading,
  onPick,
  ref: focusRef,
}: ImportSourcePickerProps): JSX.Element {
  const id = useId();
  const ref = useRef<HTMLUListElement>(null);
  const { item, active } = useRoving(ref, sources.length);
  return (
    <ul
      ref={ref}
      data-slot="import-source-picker"
      className="m-0 flex list-none flex-col gap-2 p-0"
    >
      {sources.map((source, index) => {
        const busy = reading === source.kind;
        const blocked = !!source.disabledReason;
        const waiting = !!reading && !busy;
        const name = `${id}-${index}-name`;
        const detail = `${id}-${index}-detail`;
        const reason = `${id}-${index}-reason`;
        return (
          <li key={source.kind} className="m-0">
            <button
              type="button"
              {...item(index)}
              ref={index === active ? (el) => setRef(focusRef, el) : undefined}
              data-slot="import-source"
              aria-labelledby={name}
              aria-describedby={blocked ? `${detail} ${reason}` : detail}
              aria-disabled={blocked || waiting || undefined}
              aria-busy={busy || undefined}
              onClick={() => {
                if (!blocked && !waiting && !busy) onPick(source.kind);
              }}
              className={ROW}
            >
              <span id={name} className="text-body font-semibold">
                {source.name}
              </span>
              <span id={detail} className="text-body-sm text-ink-muted">
                {busy ? "Reading…" : source.description}
              </span>
              {blocked ? (
                <span id={reason} className="text-body-sm text-ink-muted">
                  {source.disabledReason}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
