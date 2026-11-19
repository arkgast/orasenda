import type { ColumnView, Lane } from "@shared/ipc/bindings";
import { useRef, useState } from "react";

type Props = {
  columns: readonly ColumnView[];
  /** Saves a fold; null when it was saved, else the words for the refusal. */
  save(lane: Lane, folded: boolean): Promise<string | null>;
  /** The save failed: say so. The shown fold stays. */
  failed(words: string): void;
};

/**
 * Which columns are open. The fold is saved with the column (`ColumnView.folded`), so it
 * survives a remount; nothing folds for room. A toggle shows at once and is written behind. A
 * write that fails keeps the shown fold and says so; only the newest toggle of a lane may speak.
 */
export function useFolds({ columns, save, failed }: Props) {
  const [pending, setPending] = useState<Partial<Record<Lane, boolean>>>({});
  const [seen, setSeen] = useState(columns);
  const tickets = useRef<Partial<Record<Lane, number>>>({});

  // A pending fold ends once the board shows it (adjusted while rendering, not in an effect).
  if (seen !== columns) {
    setSeen(columns);
    const left = Object.entries(pending).filter(
      ([lane, folded]) => columns.find((c) => c.lane === lane)?.folded !== folded,
    );
    if (left.length !== Object.keys(pending).length) setPending(Object.fromEntries(left));
  }

  const open = columns.filter((c) => !(pending[c.lane] ?? c.folded)).map((c) => c.lane);

  const toggle = (lane: Lane) => {
    const folded = open.includes(lane);
    const ticket = (tickets.current[lane] ?? 0) + 1;
    tickets.current[lane] = ticket;
    setPending((current) => ({ ...current, [lane]: folded }));
    void save(lane, folded).then((words) => {
      if (words === null || tickets.current[lane] !== ticket) return;
      failed(words);
    });
  };

  return { open, toggle };
}
