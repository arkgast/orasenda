import type { MilestoneEvent_Serialize } from "./bindings";

type Listener = (event: MilestoneEvent_Serialize) => void;

// Module-level on purpose: a `useTimer` instance cleaned up before its `timer_state` reply
// (StrictMode's double mount, HMR) still pushes the `pending` events that reply drained, and
// only the live instance may show them. One slot, because one `useTimer` is live per window.
let listener: Listener | null = null;
let held: MilestoneEvent_Serialize[] = [];

/** Hands `event` to the registered listener at once, or holds it until the next `register`. */
export function push(event: MilestoneEvent_Serialize): void {
  if (listener) {
    listener(event);
  } else {
    held.push(event);
  }
}

/**
 * Makes `next` the live listener and delivers the held events to it, in order. The returned
 * cleanup empties the slot only if `next` still holds it.
 */
export function register(next: Listener): () => void {
  listener = next;
  const waiting = held;
  held = [];
  for (const event of waiting) next(event);
  return () => {
    if (listener === next) listener = null;
  };
}

/** Empties the slot and the held events (Vitest shares this module within a test file). */
export function resetTimerQueueForTests(): void {
  listener = null;
  held = [];
}
