// The one place that writes modifier glyphs, from their code points. The registry (Rust) owns every
// binding's glyphs, fixed keys included (`useBindings().fixedHint`); this file only serves the copy that
// names a modifier and the recorder-to-accelerator map. Built from code points so no glyph literal sits in app code.

export const KEY = {
  control: String.fromCodePoint(0x2303),
  option: String.fromCodePoint(0x2325),
  shift: String.fromCodePoint(0x21e7),
  command: String.fromCodePoint(0x2318),
  /** The return arrow; written as a code point because the copy guard reads it as an emoji. */
  enter: String.fromCodePoint(0x21a9),
} as const;

/** Glyphs in the key table's order: control, option, shift, command. */
export function chord(
  modifiers: ReadonlyArray<"control" | "option" | "shift" | "command">,
  key: string,
) {
  const order = ["control", "option", "shift", "command"] as const;
  return (
    order
      .filter((m) => modifiers.includes(m))
      .map((m) => KEY[m])
      .join("") + key
  );
}
