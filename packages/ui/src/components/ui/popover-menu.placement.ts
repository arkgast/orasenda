import { useLayoutEffect, useState } from "react";

export type MenuSide = "bottom" | "top" | "right" | "left";

// A token read as a number of pixels (Radix places in numbers): "4px" gives 4, a missing token gives 0.
export function tokenPx(name: string): number {
  if (typeof document === "undefined") return 0;
  const n = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  );
  return Number.isFinite(n) ? n : 0;
}

/**
 * Below, else above, else beside the anchor (the end side, else the start side), else below again (the panel
 * then caps and scrolls). `gap` is the space between anchor and panel; `pad` keeps the panel inside the viewport.
 */
export function chooseSide(o: {
  anchor: DOMRect;
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  gap: number;
  pad: number;
  rtl: boolean;
}): MenuSide {
  const { anchor, panel, viewport, gap, pad, rtl } = o;
  if (panel.height <= viewport.height - anchor.bottom - gap - pad) return "bottom";
  if (panel.height <= anchor.top - gap - pad) return "top";
  const after = viewport.width - anchor.right - gap - pad;
  const before = anchor.left - gap - pad;
  const [endRoom, startRoom] = rtl ? [before, after] : [after, before];
  const [endSide, startSide]: [MenuSide, MenuSide] = rtl ? ["left", "right"] : ["right", "left"];
  if (panel.width <= endRoom) return endSide;
  if (panel.width <= startRoom) return startSide;
  return "bottom";
}

/** The side to place `panel` on against `trigger`, measured again on resize, scroll and when `deps` change. */
export function useMenuSide(
  trigger: HTMLElement | null,
  panel: HTMLElement | null,
  deps: readonly unknown[],
): MenuSide {
  const [side, setSide] = useState<MenuSide>("bottom");
  useLayoutEffect(() => {
    if (!trigger || !panel) return;
    const place = () => {
      const root = document.documentElement;
      setSide(
        chooseSide({
          anchor: trigger.getBoundingClientRect(),
          // scrollHeight is the natural height, whatever the cap leaves visible.
          panel: { width: panel.offsetWidth, height: panel.scrollHeight },
          viewport: { width: root.clientWidth, height: root.clientHeight },
          gap: tokenPx("--space-1"),
          pad: tokenPx("--space-2"),
          rtl: getComputedStyle(trigger).direction === "rtl",
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [trigger, panel, ...deps]);
  return side;
}
