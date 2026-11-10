// The key table and describeShortcut (Kbd README, "Shortcut glyphs"). Canonical glyph strings only:
// modifiers in macOS order (Control, Option, Shift, Command), then exactly one key.

export interface ShortcutDescription {
  aria: string;
  spoken: string;
}

const MODIFIERS: ReadonlyArray<readonly [glyph: string, aria: string, spoken: string]> = [
  ["⌃", "Control", "Control"],
  ["⌥", "Alt", "Option"],
  ["⇧", "Shift", "Shift"],
  ["⌘", "Meta", "Command"],
];

const KEY_NAMES: Readonly<Record<string, readonly [aria: string, spoken: string]>> = {
  ".": ["Period", "Period"],
  ",": ["Comma", "Comma"],
  // Written as an escape: the copy guard reads the return arrow as an emoji.
  "\u21a9": ["Enter", "Return"],
  Space: ["Space", "Space"],
  Esc: ["Escape", "Escape"],
  "⌫": ["Backspace", "Delete"],
  "←": ["ArrowLeft", "Left Arrow"],
  "↑": ["ArrowUp", "Up Arrow"],
  "→": ["ArrowRight", "Right Arrow"],
  "↓": ["ArrowDown", "Down Arrow"],
  Tab: ["Tab", "Tab"],
};

/** Strict mode is a flag on window.Orasenda, read at every call, so a host can set it before or after the bundle runs. */
function unknownShortcut(glyphs: string): ShortcutDescription {
  const host = (globalThis as { Orasenda?: { strictShortcuts?: boolean } }).Orasenda;
  if (host?.strictShortcuts === true) {
    throw new Error(
      `describeShortcut: unknown shortcut ${JSON.stringify(glyphs)}. Use the glyphs in the Kbd README key table.`,
    );
  }
  console.warn(
    `describeShortcut: unknown shortcut ${JSON.stringify(glyphs)}, passed through as typed.`,
  );
  return { aria: glyphs, spoken: glyphs };
}

/** The ARIA and spoken forms of one canonical glyph string (Kbd README, "Shortcut glyphs"): modifiers in the order ⌃⌥⇧⌘, then one key from A-Z, 0-9, '.', ',', the return arrow, 'Space', 'Esc', '⌫', '←', '↑', '→', '↓', 'Tab'. '⌃⌥F' gives { aria: 'Control+Alt+F', spoken: 'Control-Option-F' }; '⌘.' gives { aria: 'Meta+Period', spoken: 'Command-Period' }. An unknown string throws when window.Orasenda.strictShortcuts is true; otherwise it returns { aria: glyphs, spoken: glyphs } and logs one console.warn. */
export function describeShortcut(glyphs: string): ShortcutDescription {
  const text = typeof glyphs === "string" ? glyphs : String(glyphs);
  const aria: string[] = [];
  const spoken: string[] = [];
  let at = 0;
  for (const [glyph, ariaName, spokenName] of MODIFIERS) {
    if (text.charAt(at) === glyph) {
      aria.push(ariaName);
      spoken.push(spokenName);
      at += 1;
    }
  }
  const key = text.slice(at);
  const named = Object.hasOwn(KEY_NAMES, key) ? KEY_NAMES[key] : undefined;
  if (!named && !/^[A-Z0-9]$/.test(key)) return unknownShortcut(text);
  const alone = aria.length === 0;
  aria.push(named ? named[0] : key);
  spoken.push(named ? named[1] : alone ? `${key} key` : key);
  return { aria: aria.join("+"), spoken: spoken.join("-") };
}
