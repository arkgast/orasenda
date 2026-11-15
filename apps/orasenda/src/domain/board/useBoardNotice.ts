import { type BoardNotice, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useRef } from "react";

/**
 * Calls `onNotice` for each `board-notice` (a start moved a task back to Today, or its board
 * write failed). The latest handler is used without listening again.
 */
export function useBoardNotice(onNotice: (notice: BoardNotice) => void): void {
  const latest = useRef(onNotice);
  latest.current = onNotice;
  useEffect(
    () => subscribe("board-notice", events.boardNotice.listen, (notice) => latest.current(notice)),
    [],
  );
}
