import { useEscFallback } from "@domain/keyboard/useEscFallback";
import { useSingleKeys } from "@domain/keyboard/useSingleKeys";

type Keys = {
  /** `Settings.singleKey`: Enter and S at rest work only while it is on. */
  singleKeys: boolean;
  /** Enter with focus at rest; null when there is no step to answer. */
  done: (() => void) | null;
  /** S with focus at rest; null when there is no step to answer. */
  skip: (() => void) | null;
  /** Esc: End routine while the run is open, Back to routines once it has ended. */
  leave: () => void;
};

/**
 * The run view's keys (spec decision 10). Enter on a focused button is the button's own key; Enter
 * and S with focus at rest (the step name, the page) are single keys, so they follow
 * `keys.single_key` (WCAG 2.1.4) and with it off only the buttons work. Esc is the standard
 * leave key and always works, unless an overlay is open and takes it first (looked for in the
 * capture phase, because the overlay closes on this same Esc).
 */
export function useRunKeys({ singleKeys, done, skip, leave }: Keys): void {
  const map: Record<string, () => void> = {};
  if (done) map.enter = done;
  if (skip) map.s = skip;
  useSingleKeys(map, singleKeys);

  useEscFallback(leave);
}
