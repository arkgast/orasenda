// Mirrors `PresetDef::validate` in crates/core/src/timer/preset.rs. Kept for the preset editor,
// which reuses these ranges.
export const FOCUS_RANGE = { min: 5, max: 180 };
export const BREAK_RANGE = { min: 1, max: 60 };
export const FOCUS_RANGE_HELP = `Between ${FOCUS_RANGE.min} and ${FOCUS_RANGE.max} minutes.`;
export const BREAK_RANGE_HELP = `Between ${BREAK_RANGE.min} and ${BREAK_RANGE.max} minutes.`;

const MAX_MINUTES = 4_294_967_295; // u32, what Rust takes

/** The whole number in `text`, or null when it is not one (or too big to send). */
export function parseMinutes(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= MAX_MINUTES ? value : null;
}
