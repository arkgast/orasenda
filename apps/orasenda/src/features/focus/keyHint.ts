import { readDuration } from "@shared/hooks/readDuration";
import { useEffect, useState } from "react";

type Keys = {
  singleKeys: boolean;
  idle: boolean;
  paused: boolean;
  /** The glyphs of the fixed Start and End keys (the registry's), null until it answers. */
  start: string | null;
  end: string | null;
};

/**
 * The key hint of the full-screen view ("Space pauses \u00b7 Esc leaves"). It names the keys that are
 * live now: Space only while the single-key setting is on, otherwise the fixed keys, which
 * come from the registry (a key it has not told us about is left out, never guessed).
 */
export function hintText({ singleKeys, idle, paused, start, end }: Keys): string {
  const keys = idle ? start : end;
  const first = singleKeys
    ? `Space ${idle ? "starts" : paused ? "resumes" : "pauses"}`
    : keys
      ? `${keys} ${idle ? "starts" : "ends"}`
      : null;
  return first ? `${first} \u00b7 Esc leaves` : "Esc leaves";
}

/**
 * Whether the hint shows: for `duration-hint` after the view mounts, and only when this entry is
 * one of the first three (`hintsLeft` > 0, the count Rust took at the entry's start). It is read at
 * mount and never again, so a later event cannot bring the hint back. The view fades it (and
 * shows nothing under reduce motion); this hook only says when.
 */
export function useEntryHint(hintsLeft: number): boolean {
  const [visible, setVisible] = useState(hintsLeft > 0);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), readDuration("--duration-hint"));
    return () => clearTimeout(timer);
  }, [visible]);
  return visible;
}
