import {
  DISPLAYS,
  IDLE,
  KEYBOARD,
  PAUSED,
  PRESETS,
  RUNNING,
  SETTINGS,
  STEADY,
  withGlobal,
} from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { paletteCommands } from "./paletteCommands";

const base = {
  view: IDLE,
  settings: SETTINGS,
  presets: PRESETS,
  displays: DISPLAYS,
  notifications: "granted" as const,
};

const labels = (input: Parameters<typeof paletteCommands>[0]) =>
  paletteCommands(input).map((c) => c.label);

test("palette_commands_idle_order", () => {
  const commands = paletteCommands({
    ...base,
    actions: KEYBOARD.actions,
    fixed: KEYBOARD.fixed,
  });
  expect(commands[0]).toMatchObject({
    id: "start",
    label: "Start focus · Steady Focus 25 min",
    shortcut: "⌘↩",
  });
  expect(commands[1]).toMatchObject({ id: "quick", label: "Just 2 minutes", shortcut: "⇧⌘↩" });
  const names = commands.map((c) => c.label);
  expect(names).toContain("Full screen on Built-in Retina Display");
  expect(commands.find((c) => c.id === "fullScreen:1")?.shortcut).toBe("⌘F");
  expect(commands.find((c) => c.id === "fullScreen:2")?.shortcut).toBeUndefined();
  expect(commands.find((c) => c.id === "floater")?.shortcut).toBe("⇧⌘T");
  expect(commands.find((c) => c.id === "page:today")).toMatchObject({
    label: "Go to Today",
    shortcut: "⌘1",
  });
  expect(names).not.toContain("Pause session");
  expect(names).not.toContain("End session");
});

test("palette_hints_come_from_the_fixed_keys", () => {
  const fixed = KEYBOARD.fixed.map((f) =>
    f.keys === "Super+Period" ? { ...f, display: "Z1" } : f,
  );
  expect(
    paletteCommands({ ...base, view: RUNNING, fixed }).find((c) => c.id === "end")?.shortcut,
  ).toBe("Z1");
  expect(paletteCommands(base).find((c) => c.id === "start")?.shortcut).toBeUndefined();
});

test("palette_commands_running_pause_end_first", () => {
  expect(
    paletteCommands({ ...base, view: RUNNING })
      .map((c) => c.id)
      .slice(0, 2),
  ).toEqual(["pause", "end"]);
  expect(paletteCommands({ ...base, view: PAUSED })[0]).toMatchObject({ label: "Resume session" });
  const running = labels({ ...base, view: RUNNING });
  expect(running.some((l) => l.startsWith("Start focus"))).toBe(false);
  expect(running.some((l) => l.startsWith("Use preset"))).toBe(false);
});

test("palette_presets_exclude_selected", () => {
  const rows = paletteCommands(base).filter((c) => c.id.startsWith("preset:"));
  expect(rows.map((c) => c.id)).not.toContain(`preset:${STEADY}`);
  expect(rows.map((c) => c.label)).toEqual([
    "Use preset: Gentle Start 15/5",
    "Use preset: Deep Work 90/15",
  ]);
});

test("palette_theme_lists_two_not_current", () => {
  const themes = (theme: "system" | "light" | "dark") =>
    labels({ ...base, settings: { ...SETTINGS, theme } }).filter((l) => l.startsWith("Theme:"));
  expect(themes("system")).toEqual(["Theme: Light", "Theme: Dark"]);
  expect(themes("dark")).toEqual(["Theme: Match system", "Theme: Light"]);
});

test("palette_single_display_and_no_displays", () => {
  expect(labels({ ...base, displays: [DISPLAYS[0]] })).toContain("Full screen");
  const none = labels({ ...base, displays: [] });
  expect(none.some((l) => l.startsWith("Full screen"))).toBe(false);
  expect(none).not.toContain("Floating timer");
});

test("palette_notifications_row_follows_preference", () => {
  expect(labels(base)).toContain("Turn notifications off");
  expect(labels({ ...base, settings: { ...SETTINGS, notifySessionEnd: false } })).toContain(
    "Turn notifications on",
  );
  expect(
    labels({ ...base, notifications: "unavailable" }).some((l) => /notifications/.test(l)),
  ).toBe(false);
});

test("palette_session_commands_are_pause_and_end", () => {
  expect(labels({ ...base, view: RUNNING })).toEqual(
    expect.arrayContaining(["Pause session", "End session"]),
  );
  expect(labels({ ...base, view: PAUSED })).toContain("Resume session");
});

test("palette_has_capture_command", () => {
  // In every state, with the user's current keys when the shortcut is registered.
  for (const view of [IDLE, RUNNING, PAUSED]) {
    const capture = paletteCommands({ ...base, view, actions: KEYBOARD.actions }).find(
      (c) => c.id === "capture",
    );
    expect(capture).toMatchObject({ label: "Capture a thought", shortcut: "⌃⌥N" });
  }
  // Not a fixed pair: the keys come from the shortcut, and are absent when it is off or failed.
  const other = withGlobal(KEYBOARD, "capture", { display: "⌃⇧Y" });
  expect(
    paletteCommands({ ...base, actions: other.actions }).find((c) => c.id === "capture")?.shortcut,
  ).toBe("⌃⇧Y");
  const failed = withGlobal(KEYBOARD, "capture", { status: "failed" });
  expect(
    paletteCommands({ ...base, actions: failed.actions }).find((c) => c.id === "capture")?.shortcut,
  ).toBeUndefined();
  const without = paletteCommands(base).find((c) => c.id === "capture");
  expect(without?.label).toBe("Capture a thought");
  expect(without?.shortcut).toBeUndefined();
  // Before the settings load the palette still offers it.
  expect(
    paletteCommands({ ...base, settings: null, view: null }).some((c) => c.id === "capture"),
  ).toBe(true);
});

test("palette_displays_only_lists_the_display_commands", () => {
  const input = { ...base, actions: KEYBOARD.actions, fixed: KEYBOARD.fixed };
  const only = paletteCommands({ ...input, displaysOnly: true });
  expect(only.map((c) => c.id)).toEqual(["fullScreen:1", "fullScreen:2"]);
  expect(only.map((c) => c.label)).toEqual([
    "Full screen on Built-in Retina Display",
    "Full screen on DELL U2720Q",
  ]);
  // Nothing else: no session rows, pages, themes or the floater.
  expect(paletteCommands(input).length).toBeGreaterThan(only.length);
});

test("palette_one_display_is_plain_full_screen", () => {
  const one = paletteCommands({ ...base, displays: [DISPLAYS[0]] });
  expect(one.find((c) => c.id === "fullScreen")).toMatchObject({ label: "Full screen" });
  expect(one.some((c) => c.id.startsWith("fullScreen:"))).toBe(false);
});
