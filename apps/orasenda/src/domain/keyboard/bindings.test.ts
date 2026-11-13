import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BindingView } from "@shared/ipc/bindings";
import { KEYBOARD } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { bindingLine } from "./bindings";

const srcDir = join(import.meta.dirname, "..", "..");

const view = (keys: string | null, extra: Record<string, unknown> = {}): BindingView => ({
  keys,
  display: null,
  spoken: null,
  isDefault: false,
  repaired: false,
  ...extra,
});

const PLAIN = view("Control+Alt+KeyF");
const ANOTHER_APP = "Another app uses this shortcut. Pick a different one.";

test("no_glyph_literals_in_app_code", () => {
  const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name).slice(srcDir.length + 1))
    .filter((file) => !file.startsWith("dev/") && !file.startsWith("shared/test/"))
    .filter((file) => !/\.test\.tsx?$|\.support\.tsx?$/.test(file));
  expect(files.length).toBeGreaterThan(50);
  const found: string[] = [];
  for (const file of files) {
    readFileSync(join(srcDir, file), "utf8")
      .split("\n")
      .forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("/*") || code.startsWith("*")) return;
        if (/[⌘⌃⌥⇧]/.test(code)) found.push(`${file}:${index + 1}`);
      });
  }
  expect(found).toEqual([]);
});

test("binding_line_per_error", () => {
  const line = (error: Parameters<typeof bindingLine>[0]) => bindingLine(error, PLAIN, false);
  expect(line({ needsModifier: { slot: "global" } })).toBe(
    "Add ⌘, ⌃ or ⌥. A single key can't be a shortcut.",
  );
  expect(line({ needsModifier: { slot: "app" } })).toBe(
    "Add ⌘ or ⌃. A single key can't be a shortcut.",
  );
  expect(line("systemKeeps")).toBe("macOS keeps this key, so it won't reach Orasenda.");
  // The action is named in lower case, inside the sentence.
  expect(line({ inUse: { action: "Full screen on this display" } })).toBe(
    "Orasenda uses this for full screen on this display. Pick a different one.",
  );
  expect(line({ warning: { reason: "Other apps use this." } })).toBe(
    "Other apps use this. Use it everywhere anyway?",
  );
  expect(line("unavailable")).toBe(ANOTHER_APP);
  expect(line("invalid")).toBe("That isn't a shortcut Orasenda can use. Pick a different one.");
  expect(bindingLine(null, view("Super+KeyK", { repaired: true }), false)).toBe(
    "This shortcut was turned off because another action uses it.",
  );
  expect(bindingLine(null, PLAIN, false)).toBeNull();
  expect(bindingLine(null, { ...PLAIN, status: "failed" as const }, false)).toBe(ANOTHER_APP);
});

test("store_unavailable_line", () => {
  expect(bindingLine("store", PLAIN, false)).toBe("Orasenda can't save this shortcut right now.");
});

test("voiceover_line_ctrl_opt_cmd", () => {
  const plain = "VoiceOver uses Control-Option keys. You may want a different shortcut.";
  const withCommand = "VoiceOver uses this key while it's on. Pick another to use both.";
  expect(bindingLine(null, PLAIN, true)).toBe(plain);
  expect(bindingLine(null, view("Control+Alt+Super+KeyT"), true)).toBe(withCommand);
  expect(bindingLine(null, view("Control+Alt+Shift+Super+KeyF"), true)).toBe(withCommand);
  // Only while VoiceOver is on, and only for Control and Option together.
  expect(bindingLine(null, PLAIN, false)).toBeNull();
  expect(bindingLine(null, view("Control+KeyF"), true)).toBeNull();
  expect(bindingLine(null, view("Alt+KeyF"), true)).toBeNull();
  // An error still wins over the VoiceOver note.
  expect(bindingLine("store", PLAIN, true)).toBe("Orasenda can't save this shortcut right now.");
  expect(KEYBOARD.voiceOver).toBe(false);
});
