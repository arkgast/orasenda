import { InlineNotice, ScrollRegion, TaskPicker, type TaskPickerOption } from "@orasenda/ui";
import type { ReactElement } from "react";
import { isTooLong, type Pick, TOO_LONG_PRIORITY } from "./useWeekly";

const MAX_PICKS = 3;

type Props = {
  picks: Pick[];
  options: TaskPickerOption[];
  /** A failed save, in a plain line at the top of the step. */
  line: string | null;
  /** Rust refused a typed title as too long: the line goes by the picker that caused it. */
  tooLong: boolean;
  onChange(picks: Pick[]): void;
};

/** Step 3: up to three optional priorities. Nothing is chosen for the person; a fourth never appears. */
export function PrioritiesStep({ picks, options, line, tooLong, onChange }: Props): ReactElement {
  const slots = picks.length < MAX_PICKS ? picks.length + 1 : MAX_PICKS;
  const marked = tooLong ? picks.map(isTooLong) : [];
  const unplaced = tooLong && !marked.includes(true);
  const taken = (index: number) =>
    new Set(picks.flatMap((p, i) => (i !== index && "task" in p ? [p.task] : [])));
  const place = (index: number, pick: Pick | null) => {
    const next = picks.slice();
    if (pick === null) next.splice(index, 1);
    else next[index] = pick;
    onChange(next);
  };
  return (
    <ScrollRegion label="Priorities">
      <div className="app-shutdown-body">
        {line ? <InlineNotice>{line}</InlineNotice> : null}
        {unplaced ? <InlineNotice>{TOO_LONG_PRIORITY}</InlineNotice> : null}
        <p className="app-review-line">Up to three, all optional.</p>
        <ol className="app-weekly-slots" aria-label="Priorities">
          {Array.from({ length: slots }, (_, index) => {
            const pick = picks[index];
            const used = taken(index);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions, not items
              <li key={index} className="app-weekly-slot">
                <TaskPicker
                  quietLabel={`Add priority ${index + 1}`}
                  task={
                    pick
                      ? {
                          id: "task" in pick ? pick.task : `new-${index}`,
                          title: "task" in pick ? pick.title : pick.newTitle,
                        }
                      : undefined
                  }
                  options={options.filter((o) => !used.has(o.id))}
                  onPick={(id) => {
                    if (id === null) return place(index, null);
                    const found = options.find((o) => o.id === id);
                    if (found && !used.has(id)) place(index, { task: id, title: found.title });
                  }}
                  onCreate={(title) => {
                    const text = title.trim();
                    if (text) place(index, { newTitle: text });
                  }}
                />
                {marked[index] ? <p className="app-review-line">{TOO_LONG_PRIORITY}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </ScrollRegion>
  );
}
