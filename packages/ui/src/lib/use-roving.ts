import { type KeyboardEvent, type RefObject, useState } from "react";

/**
 * One tab stop for a vertical list: the active item has tabIndex 0, the rest -1. Up and Down (and Home and
 * End) move focus between the items marked `data-roving` inside `container`.
 */
export interface RovingItemProps {
  "data-roving": string;
  tabIndex: number;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function useRoving(container: RefObject<HTMLElement | null>): {
  item: (index: number) => RovingItemProps;
  active: number;
} {
  const [active, setActive] = useState(0);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const items = Array.from(
      container.current?.querySelectorAll<HTMLElement>("[data-roving]") ?? [],
    );
    const at = items.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    const target =
      event.key === "ArrowDown"
        ? Math.min(at + 1, items.length - 1)
        : event.key === "ArrowUp"
          ? Math.max(at - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    setActive(target);
    items[target]?.focus();
  };
  /** Props for item `index` (including the key handler); focus moving to it by pointer or script also makes it the stop. */
  const item = (index: number) => ({
    "data-roving": "",
    tabIndex: index === active ? 0 : -1,
    onFocus: () => setActive(index),
    onKeyDown,
  });
  return { item, active };
}
