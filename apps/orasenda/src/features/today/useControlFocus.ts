import { type FocusEvent, useCallback, useEffect, useRef } from "react";

type Want = "pause" | "start" | null;

/** How long a wish for focus lasts. */
const WISH_MS = 2000;

/**
 * Where focus goes when the controls change (spec C, "Focus and tab order"). A start made here
 * moves focus to Pause session once the view runs. An end made here, or a natural end while focus
 * was in the controls, moves it to Start focus once the ended line has mounted (a line different from the one showing at the end, so a standing
 * line does not count), so the line is announced first. Nothing else moves focus: not a tick, not a transition from another surface.
 */
export function useControlFocus(state: string | undefined, lineText: string | undefined) {
  const box = useRef<HTMLDivElement>(null);
  const want = useRef<Want>(null);
  const inside = useRef(false);
  const previous = useRef(state);
  const timer = useRef<number | undefined>(undefined);
  // The line as it was when the wish was made: Start waits for a different one (the ended line).
  const baseline = useRef<string | undefined>(undefined);
  const line = useRef(lineText);
  line.current = lineText;

  // A wish nobody fulfils (an end that shows no line) must not wait for a later session.
  const wish = useCallback((next: Want) => {
    want.current = next;
    baseline.current = line.current;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      want.current = null;
    }, WISH_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Focus inside the controls: Tab or a click in leaves by relatedTarget or a pointer elsewhere. A
  // removed button (End, at a natural end) leaves the flag as it was, which is what we need.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) inside.current = false;
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, []);

  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (was === state) return;
    if (
      state === "idle" &&
      was !== undefined &&
      was !== "idle" &&
      inside.current &&
      !want.current
    ) {
      wish("start");
    }
  }, [state, wish]);

  useEffect(() => {
    if (want.current === "pause" && state === "running") {
      box.current?.querySelector<HTMLElement>("#today-pause")?.focus();
      want.current = null;
    } else if (
      want.current === "start" &&
      state === "idle" &&
      lineText !== undefined &&
      lineText !== baseline.current
    ) {
      box.current?.querySelector<HTMLElement>("[data-slot='start-button'] button")?.focus();
      want.current = null;
    }
  }, [state, lineText]);

  return {
    boxProps: {
      ref: box,
      onFocus: () => {
        inside.current = true;
      },
      onBlur: (event: FocusEvent) => {
        // Moving to another element: no longer inside. A removal has no related target.
        if (event.relatedTarget && !box.current?.contains(event.relatedTarget as Node)) {
          inside.current = false;
        }
      },
    },
    /** A start was asked for from this page. */
    startRequested: () => wish("pause"),
    /** Moves focus to Start focus now (the row's own button is gone). */
    focusStart: () => {
      box.current?.querySelector<HTMLElement>("[data-slot='start-button'] button")?.focus();
    },
    /** An end was asked for from this page. */
    endRequested: () => wish("start"),
    /** The command was refused: focus has nowhere to go. */
    cancel: () => {
      want.current = null;
    },
  };
}
