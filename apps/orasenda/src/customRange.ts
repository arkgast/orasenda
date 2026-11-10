import type { CustomSpec } from "./bindings";

// Mirrors `CustomSpec::validate` in crates/core/src/timer/mod.rs: the refusal does not say which
// field failed, so the helpers are chosen from the spec that was sent.
export const FOCUS_RANGE = { min: 5, max: 180 };
export const BREAK_RANGE = { min: 1, max: 60 };
export const FOCUS_RANGE_HELP = `Between ${FOCUS_RANGE.min} and ${FOCUS_RANGE.max} minutes.`;
export const BREAK_RANGE_HELP = `Between ${BREAK_RANGE.min} and ${BREAK_RANGE.max} minutes.`;

/** Which fields of `custom` are out of range locally. */
export function outOfRange(custom: CustomSpec): { focus: boolean; break: boolean } {
  return {
    focus: custom.focusMin < FOCUS_RANGE.min || custom.focusMin > FOCUS_RANGE.max,
    break: custom.breakMin < BREAK_RANGE.min || custom.breakMin > BREAK_RANGE.max,
  };
}
