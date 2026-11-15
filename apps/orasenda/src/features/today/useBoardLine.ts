import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

/** How long a board line stays on Today's status row. */
export const BOARD_LINE_MS = 10_000;

/** A one-shot line from the board (a notice, a refused task) that goes away by itself. */
export function useBoardLine(): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (line === null) return;
    const timer = setTimeout(() => setLine(null), BOARD_LINE_MS);
    return () => clearTimeout(timer);
  }, [line]);
  return [line, setLine];
}
