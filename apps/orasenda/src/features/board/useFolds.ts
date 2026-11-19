import type { ColumnView, Lane } from "@shared/ipc/bindings";
import { useEffect, useState } from "react";

type Props = {
  columns: readonly ColumnView[];
  /** Saves a fold; true when it was saved. */
  save(lane: Lane, folded: boolean): Promise<boolean>;
  /** The save failed: say so. The shown fold stays what it was. */
  failed(): void;
};

/**
 * Which columns are open. The fold is saved with the column (`ColumnView.folded`), so it
 * survives a remount; nothing folds for room. A toggle shows at once and is written behind: a
 * write that fails drops the pending fold, so the column shows what is saved, and says so.
 */
export function useFolds({ columns, save, failed }: Props) {
  const [pending, setPending] = useState<Partial<Record<Lane, boolean>>>({});

  // A pending fold ends once the board shows it.
  useEffect(() => {
    setPending((current) => {
      const left = Object.entries(current).filter(
        ([lane, folded]) => columns.find((c) => c.lane === lane)?.folded !== folded,
      );
      return left.length === Object.keys(current).length ? current : Object.fromEntries(left);
    });
  }, [columns]);

  const open = columns.filter((c) => !(pending[c.lane] ?? c.folded)).map((c) => c.lane);

  const toggle = (lane: Lane) => {
    const folded = open.includes(lane);
    setPending((current) => ({ ...current, [lane]: folded }));
    void save(lane, folded).then((saved) => {
      if (saved) return;
      setPending(({ [lane]: _gone, ...rest }) => rest);
      failed();
    });
  };

  return { open, toggle };
}
