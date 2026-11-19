import type { TaskPickerOption } from "@orasenda/ui";
import {
  DISPLAYS,
  IDLE,
  KEYBOARD,
  PAUSED,
  PRESETS,
  RUNNING,
  SETTINGS,
  STEADY,
  taskOption,
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
  tasks: [] as TaskPickerOption[],
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

const OPEN = [
  taskOption("b", "Plan the week", "backlog"),
  taskOption("t", "Write notes", "today", true),
  taskOption("d", "Fix the build", "doing"),
];

test("choose_task_hidden_without_open_tasks", () => {
  expect(labels(base)).not.toContain("Choose a task…");
  const idle = labels({ ...base, tasks: OPEN });
  expect(idle.indexOf("Choose a task…")).toBe(idle.indexOf("Just 2 minutes") + 1);
  const running = labels({ ...base, view: RUNNING, tasks: OPEN });
  expect(running.indexOf("Choose a task…")).toBe(running.indexOf("End session") + 1);
  expect(labels({ ...base, tasks: OPEN })).not.toContain("Clear task");
});

test("clear_task_only_when_linked", () => {
  const linked = { ...IDLE, task: { id: "t", title: "Write notes" } };
  expect(labels({ ...base, view: linked })).toContain("Clear task");
  expect(labels({ ...base, view: linked, tasks: OPEN }).slice(2, 4)).toEqual([
    "Choose a task…",
    "Clear task",
  ]);
});

test("task_mode_orders_doing_today_backlog_with_hints", () => {
  const rows = paletteCommands({ ...base, tasks: OPEN, tasksOnly: true });
  expect(rows.map((r) => [r.label, r.hint])).toEqual([
    ["Fix the build", "Doing"],
    ["Write notes", "Today · Frog"],
    ["Plan the week", "Backlog"],
  ]);
});

test("import_tasks_follows_the_task_commands_and_is_never_first", () => {
  for (const input of [base, { ...base, view: null }, { ...base, tasks: OPEN }]) {
    const rows = paletteCommands(input);
    const at = rows.findIndex((c) => c.id === "importTasks");
    expect(at).toBeGreaterThan(0);
    expect(rows[at]).toMatchObject({
      label: "Import tasks…",
      hint: "From Reminders, Todoist or Things into Backlog",
    });
    expect(rows[at].shortcut).toBeUndefined();
  }
  const withTasks = labels({ ...base, tasks: OPEN });
  expect(withTasks.indexOf("Import tasks…")).toBeGreaterThan(withTasks.indexOf("Choose a task…"));
  expect(paletteCommands({ ...base, tasks: OPEN, tasksOnly: true }).map((c) => c.id)).not.toContain(
    "importTasks",
  );
  expect(paletteCommands({ ...base, displaysOnly: true }).map((c) => c.id)).not.toContain(
    "importTasks",
  );
});

test("start_shutdown_is_listed_with_the_main_commands_and_not_in_the_sub_modes", () => {
  for (const input of [base, { ...base, view: null }, { ...base, tasks: OPEN }]) {
    expect(paletteCommands(input)).toContainEqual({ id: "startShutdown", label: "Start shutdown" });
  }
  expect(paletteCommands({ ...base, tasksOnly: true }).map((c) => c.id)).not.toContain(
    "startShutdown",
  );
  expect(paletteCommands({ ...base, displaysOnly: true }).map((c) => c.id)).not.toContain(
    "startShutdown",
  );
});

test("start_weekly_review_is_listed_with_the_main_commands_and_not_in_the_sub_modes", () => {
  for (const input of [base, { ...base, view: null }, { ...base, tasks: OPEN }]) {
    expect(paletteCommands(input)).toContainEqual({
      id: "startWeekly",
      label: "Start weekly review",
    });
  }
  for (const sub of [{ tasksOnly: true }, { displaysOnly: true }]) {
    expect(paletteCommands({ ...base, ...sub }).map((c) => c.id)).not.toContain("startWeekly");
  }
});

test("palette_task_order_matches_picker", () => {
  const tasks = [
    { id: "b", title: "Backlog task", order: 4, laneLabel: "Backlog" },
    { id: "w", title: "Waiting task", order: 3, laneLabel: "Waiting" },
    { id: "d", title: "Doing task", order: 0, laneLabel: "Doing" },
    { id: "t", title: "Today task", order: 1, laneLabel: "Today", frog: true },
    { id: "i", title: "Ideas task", order: 2, laneLabel: "Ideas" },
  ];
  const rows = paletteCommands({ ...base, tasks, tasksOnly: true });
  expect(rows.map((r) => [r.label, r.hint])).toEqual([
    ["Doing task", "Doing"],
    ["Today task", "Today · Frog"],
    ["Ideas task", "Ideas"],
    ["Waiting task", "Waiting"],
    ["Backlog task", "Backlog"],
  ]);
});
