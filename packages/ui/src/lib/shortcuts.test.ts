import { afterEach, expect, test, vi } from "vitest";
import { describeShortcut } from "./shortcuts.ts";

const MODS: Array<[string, string, string]> = [
  ["⌃", "Control", "Control"],
  ["⌥", "Alt", "Option"],
  ["⇧", "Shift", "Shift"],
  ["⌘", "Meta", "Command"],
];
const NAMED: Array<[string, string, string]> = [
  [".", "Period", "Period"],
  [",", "Comma", "Comma"],
  ["↩", "Enter", "Return"],
  ["Space", "Space", "Space"],
  ["Esc", "Escape", "Escape"],
  ["⌫", "Backspace", "Delete"],
  ["←", "ArrowLeft", "Left Arrow"],
  ["↑", "ArrowUp", "Up Arrow"],
  ["→", "ArrowRight", "Right Arrow"],
  ["↓", "ArrowDown", "Down Arrow"],
  ["Tab", "Tab", "Tab"],
];
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];

afterEach(() => {
  window.Orasenda.strictShortcuts = true;
});

test("describe_shortcut_control_option_f", () => {
  expect(describeShortcut("⌃⌥F")).toEqual({ aria: "Control+Alt+F", spoken: "Control-Option-F" });
});

test("describe_shortcut_command_period", () => {
  expect(describeShortcut("⌘.")).toEqual({ aria: "Meta+Period", spoken: "Command-Period" });
  expect(describeShortcut("⇧⌘P")).toEqual({ aria: "Shift+Meta+P", spoken: "Shift-Command-P" });
});

test("describe_shortcut_named_keys", () => {
  for (const [glyph, aria, spoken] of NAMED) {
    expect(describeShortcut(glyph)).toEqual({ aria, spoken });
  }
  expect(describeShortcut("F")).toEqual({ aria: "F", spoken: "F key" });
  expect(describeShortcut("7")).toEqual({ aria: "7", spoken: "7 key" });
});

test("describe_shortcut_round_trips_every_table_key", () => {
  const keys: Array<[string, string, string]> = [
    ...LETTERS.map((l): [string, string, string] => [l, l, l]),
    ...NAMED,
  ];
  const subsets: number[][] = [[], [0], [1], [2], [3], [0, 1], [1, 3], [0, 1, 2, 3]];
  const ariaToGlyph = new Map<string, string>();
  const spokenToGlyph = new Map<string, string>();
  for (const subset of subsets) {
    for (const [glyph, aria, spoken] of keys) {
      const glyphs = subset.map((i) => MODS[i][0]).join("") + glyph;
      const alone = subset.length === 0 && /^[A-Z0-9]$/.test(glyph);
      const expAria = [...subset.map((i) => MODS[i][1]), aria].join("+");
      const expSpoken = [...subset.map((i) => MODS[i][2]), alone ? `${spoken} key` : spoken].join(
        "-",
      );
      const got = describeShortcut(glyphs);
      expect(got).toEqual({ aria: expAria, spoken: expSpoken });
      // One-to-one.
      expect(ariaToGlyph.has(got.aria)).toBe(false);
      expect(spokenToGlyph.has(got.spoken)).toBe(false);
      ariaToGlyph.set(got.aria, glyphs);
      spokenToGlyph.set(got.spoken, glyphs);
      // And back, from the aria form.
      const ariaParts = got.aria.split("+");
      const backKey = keys.find(([, a]) => a === ariaParts[ariaParts.length - 1]);
      const backMods = ariaParts
        .slice(0, -1)
        .map((m) => MODS.find(([, a]) => a === m)?.[0])
        .join("");
      expect(backMods + backKey?.[0]).toBe(glyphs);
      // And back, from the spoken form (modifiers never contain a dash; "Left Arrow" has a space).
      const spokenParts = got.spoken.split("-");
      const key = spokenParts[spokenParts.length - 1].replace(/ key$/, "");
      const spokenKey = keys.find(([, , sp]) => sp === key);
      const spokenMods = spokenParts
        .slice(0, -1)
        .map((m) => MODS.find(([, , sp]) => sp === m)?.[0])
        .join("");
      expect(spokenMods + spokenKey?.[0]).toBe(glyphs);
    }
  }
});

test("describe_shortcut_unknown_key_throws_when_strict", () => {
  expect(window.Orasenda.strictShortcuts).toBe(true);
  for (const bad of ["Cmd+.", "f", "⌘⌃F", "⌘⌘F", "⌘", "F1", ""]) {
    expect(() => describeShortcut(bad)).toThrow(JSON.stringify(bad));
  }
});

test("describe_shortcut_unknown_key_returns_glyphs_when_not_strict", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    window.Orasenda.strictShortcuts = false;
    expect(describeShortcut("Cmd+.")).toEqual({ aria: "Cmd+.", spoken: "Cmd+." });
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    window.Orasenda.strictShortcuts = true;
    warn.mockRestore();
  }
});
