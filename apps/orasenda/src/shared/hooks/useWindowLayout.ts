import { type TimerLayout, timerLayout } from "@orasenda/ui";
import { useEffect, useState } from "react";

export type WindowLayout = {
  /** Under the compact width or height: no rail, a Pages button instead. */
  compact: boolean;
  timer: TimerLayout;
  width: number;
  height: number;
};

/** A px token (`--layout-compact-width`) as a number; a missing or odd value is a bug, not a default. */
function readPx(name: string): number {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  if (!Number.isFinite(value)) throw new Error(`${name} is not defined: is the token CSS loaded?`);
  return value;
}

type Size = { width: number; height: number };

/**
 * The window's inner size and what follows from it. It reads the size on `resize` only, never on a
 * tick; the compact thresholds come from the token variables, read once at mount (spec C, sizes).
 */
export function useWindowLayout(): WindowLayout {
  const [limits] = useState(() => ({
    width: readPx("--layout-compact-width"),
    height: readPx("--layout-compact-height"),
  }));
  const [size, setSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);
  return {
    compact: size.width < limits.width || size.height < limits.height,
    timer: timerLayout({
      contentWidth: size.width,
      contentHeight: size.height,
      windowWidth: size.width,
    }),
    ...size,
  };
}
