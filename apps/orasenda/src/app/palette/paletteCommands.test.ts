import { expect, test } from "vitest";
import { DISPLAYS, IDLE, PAUSED, PRESETS, RUNNING, SETTINGS, STEADY } from "../../test/fixtures";
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
  const commands = paletteCommands(base);
  expect(commands[0]).toMatchObject({
    id: "start",
    label: "Start focus · Steady Focus 25 min",
    shortcut: "⌘↩",
  });
  expect(commands[1]).toMatchObject({ id: "quick", label: "Just 2 minutes", shortcut: "⇧⌘↩" });
  const names = commands.map((c) => c.label);
  expect(names).toContain("Full screen on Built-in Retina Display");
  expect(commands.find((c) => c.id === "fullScreen:1")?.shortcut).toBe("⇧⌘F");
  expect(commands.find((c) => c.id === "fullScreen:2")?.shortcut).toBeUndefined();
  expect(commands.find((c) => c.id === "floater")?.shortcut).toBe("⇧⌘T");
  expect(commands.find((c) => c.id === "page:today")).toMatchObject({
    label: "Go to Today",
    shortcut: "⌘1",
  });
  expect(names).not.toContain("Pause session");
  expect(names).not.toContain("End session");
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
