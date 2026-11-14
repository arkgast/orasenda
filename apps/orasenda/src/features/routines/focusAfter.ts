import { useCallback, useEffect, useState } from "react";

type Find = () => HTMLElement | null | undefined;

/**
 * Asks for focus to move once the next render is committed: after a move, a remove or an Undo,
 * the element focus belongs on (the moved item's More, the Undo action) may only exist then. A
 * target that is not there after that render is dropped, so focus is never taken later by surprise.
 */
export function useFocusAfter(): (find: Find) => void {
  const [request, setRequest] = useState<{ find: Find } | null>(null);
  useEffect(() => {
    if (!request) return;
    request.find()?.focus();
    setRequest(null);
  }, [request]);
  return useCallback((find: Find) => setRequest({ find }), []);
}

/** The element with `id`, looked up when focus moves. */
export const byId =
  (id: string): Find =>
  () =>
    document.getElementById(id);
