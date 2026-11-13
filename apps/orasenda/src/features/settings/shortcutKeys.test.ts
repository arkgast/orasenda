import { expect, test } from "vitest";
import { toAccelerator } from "./shortcutKeys";

const RETURN = String.fromCharCode(0x21a9);

test("toAccelerator_names_every_key_the_recorder_can_emit", () => {
  const table: [string, string][] = [
    ["⌃⌥F", "Control+Alt+KeyF"],
    ["⇧⌘P", "Shift+Super+KeyP"],
    ["⌃⌥⇧⌘Z", "Control+Alt+Shift+Super+KeyZ"],
    ["⌘0", "Super+Digit0"],
    ["⌃9", "Control+Digit9"],
    ["⌘.", "Super+Period"],
    ["⌘,", "Super+Comma"],
    [`⌘${RETURN}`, "Super+Enter"],
    ["⌃Space", "Control+Space"],
    ["⌥Tab", "Alt+Tab"],
    ["⌘⌫", "Super+Backspace"],
    ["⌘←", "Super+ArrowLeft"],
    ["⌘↑", "Super+ArrowUp"],
    ["⌘→", "Super+ArrowRight"],
    ["⌘↓", "Super+ArrowDown"],
  ];
  for (const [glyphs, accelerator] of table) expect(toAccelerator(glyphs)).toBe(accelerator);
});

test("toAccelerator_rejects_what_rust_would", () => {
  for (const glyphs of ["⌘?", "⌘a", "⌘F1", "", "⌘"]) expect(toAccelerator(glyphs)).toBeNull();
});
