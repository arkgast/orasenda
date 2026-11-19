import type { ColumnView, Lane } from "@shared/ipc/bindings";

/** The id on a column's region (or its folded strip), so the board can move focus to it. */
export const columnId = (lane: Lane): string => `board-col-${lane}`;

/** The lane next to `lane` in `direction` among `columns` (custom ones included), or null at the ends. */
export function neighbour(
  columns: readonly ColumnView[],
  lane: Lane,
  direction: -1 | 1,
): Lane | null {
  const at = columns.findIndex((c) => c.lane === lane);
  return at < 0 ? null : (columns[at + direction]?.lane ?? null);
}

/** The task's column and its place in it, or null when it is not on the board. */
export function locate(
  columns: readonly ColumnView[],
  id: string,
): { column: ColumnView; index: number } | null {
  for (const column of columns) {
    const index = column.tasks.findIndex((t) => t.id === id);
    if (index >= 0) return { column, index };
  }
  return null;
}

/** "1 session" or "3 sessions". */
export const sessions = (n: number): string => `${n} ${n === 1 ? "session" : "sessions"}`;
