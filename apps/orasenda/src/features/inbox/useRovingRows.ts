import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Where focus goes after the next render: a row index, or -1 for the page heading. */
export type FocusTarget = number | null;

/**
 * The Inbox list as one roving tab stop. `active` is the row that holds the stop (by note id, so it
 * follows a note when the list changes); ↑/↓/Home/End move focus; a row asked for through `focusAfter`
 * is focused after the render that follows (the heading for -1), so focus never drops to the page.
 */
export function useRovingRows(root: RefObject<HTMLElement | null>, ids: string[]) {
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const target = useRef<FocusTarget>(null);
  const found = ids.indexOf(activeId ?? "");
  const active = Math.max(found, 0);

  const rows = useCallback(
    () => Array.from(root.current?.querySelectorAll<HTMLElement>("ul > li") ?? []),
    [root],
  );

  // After every render: the ref is set only by a move, Remove or Undo and is cleared as it is used.
  useLayoutEffect(() => {
    const row = target.current;
    if (row === null) return;
    target.current = null;
    (rows()[row] ?? root.current?.querySelector<HTMLElement>("h1"))?.focus();
  });

  const focusAfter = useCallback((row: number) => {
    target.current = row;
  }, []);

  /** Arrow keys on the row itself; keys from the menu button or an open menu are left alone. */
  const onArrow = (event: KeyboardEvent<HTMLLIElement>, index: number): boolean => {
    if (event.target !== event.currentTarget) return false;
    const last = ids.length - 1;
    const next =
      event.key === "ArrowDown"
        ? Math.min(index + 1, last)
        : event.key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return false;
    event.preventDefault();
    rows()[next]?.focus();
    return true;
  };

  return {
    tabIndex: (index: number): 0 | -1 => (index === active ? 0 : -1),
    /** Call from the list's `onFocus`: the focused row takes the stop. */
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const id = ids[rows().indexOf(event.target.closest("li") as HTMLElement)];
      if (id) setActiveId(id);
    },
    onArrow,
    focusAfter,
  };
}
