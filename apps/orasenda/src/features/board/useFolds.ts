import type { Lane } from "@shared/ipc/bindings";
import { useState } from "react";
import { LANES } from "./lanes";

/**
 * Which columns are open (Today-first board, ADR in the spec). The order list holds the lanes the
 * person has open, least recently opened first; the board folds from its front when the window is
 * too narrow, which gives the README's order (Backlog, Doing, Today) from the start and the
 * "opening a strip folds the least recently opened" rule afterwards. The column holding the
 * running task is never the one folded for room. Done starts folded.
 */
const START: readonly Lane[] = ["backlog", "doing", "today"];

/** How many open columns fit in `width`; with no measure yet, the three the default window holds. */
export function capacity(
  width: number | null,
  sizes: { min: number; strip: number; gap: number } | null,
): number {
  if (width === null || width <= 0 || sizes === null) return 3;
  for (let open = LANES.length; open > 1; open--) {
    const folded = LANES.length - open;
    const needed = open * sizes.min + folded * sizes.strip + (LANES.length - 1) * sizes.gap;
    if (needed <= width) return open;
  }
  return 1;
}

/** The lanes shown open: the most recent `room` of `order`, sparing `keep`. */
export function openLanes(order: readonly Lane[], room: number, keep: Lane | null): Lane[] {
  const shown = [...order];
  // With room for one column only, the most recently opened lane wins: a strip or Add task that
  // opens nothing would be a silent failure. The running column is spared only beside another.
  const spare = room >= 2 ? keep : null;
  while (shown.length > room) {
    const drop = shown.findIndex((lane) => lane !== spare);
    shown.splice(Math.max(drop, 0), 1);
  }
  return LANES.filter((lane) => shown.includes(lane));
}

export function useFolds(room: number, keep: Lane | null) {
  const [order, setOrder] = useState<readonly Lane[]>(START);
  const open = openLanes(order, room, keep);
  const toggle = (lane: Lane) =>
    setOrder((current) => {
      const without = current.filter((l) => l !== lane);
      return open.includes(lane) ? without : [...without, lane];
    });
  return { open, toggle };
}
