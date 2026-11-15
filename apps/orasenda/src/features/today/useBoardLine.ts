import { useCallback, useEffect, useState } from "react";

/** How long a board line stays on Today's status row. */
export const BOARD_LINE_MS = 10_000;

export type BoardLine = { text: string; tone: "neutral" | "attention"; at: number };

/**
 * A one-shot line from the board (a notice, a refused task) that goes away by itself. Each call
 * restarts the clock, even for the same words.
 */
export function useBoardLine(): [
  BoardLine | null,
  (text: string, tone?: BoardLine["tone"]) => void,
] {
  const [line, setLine] = useState<BoardLine | null>(null);
  const show = useCallback(
    (text: string, tone: BoardLine["tone"] = "neutral") =>
      setLine((last) => ({ text, tone, at: (last?.at ?? 0) + 1 })),
    [],
  );
  useEffect(() => {
    if (line === null) return;
    const timer = setTimeout(() => setLine(null), BOARD_LINE_MS);
    return () => clearTimeout(timer);
  }, [line]);
  return [line, show];
}
