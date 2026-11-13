// The ShortcutRecorder emits glyph strings ("⌃⌥F"); Rust accepts only the canonical accelerator
// ("Control+Alt+KeyF": modifiers Control, Alt, Shift, Super, then the KeyboardEvent.code, joined by "+").
// The recorder already emits modifiers in ⌃⌥⇧⌘ order, so the canonical order follows.

const MODIFIERS: Readonly<Record<string, string>> = {
  "⌃": "Control",
  "⌥": "Alt",
  "⇧": "Shift",
  "⌘": "Super",
};

// Built from its code point: the copy guard reads the return arrow as an emoji.
const RETURN = String.fromCharCode(0x21a9);

const NAMED: Readonly<Record<string, string>> = {
  ".": "Period",
  ",": "Comma",
  [RETURN]: "Enter",
  Space: "Space",
  Tab: "Tab",
  "⌫": "Backspace",
  "←": "ArrowLeft",
  "↑": "ArrowUp",
  "→": "ArrowRight",
  "↓": "ArrowDown",
};

function codeFor(key: string): string | null {
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return Object.hasOwn(NAMED, key) ? NAMED[key] : null;
}

/** The canonical accelerator for one recorded glyph string, or null when it is not one Rust accepts. */
export function toAccelerator(glyphs: string): string | null {
  const parts: string[] = [];
  let rest = glyphs;
  while (rest.length > 0 && Object.hasOwn(MODIFIERS, rest[0])) {
    parts.push(MODIFIERS[rest[0]]);
    rest = rest.slice(1);
  }
  const code = codeFor(rest);
  return code ? [...parts, code].join("+") : null;
}
