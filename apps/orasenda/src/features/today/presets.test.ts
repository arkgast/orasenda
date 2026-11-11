import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { mockBackend, settle } from "../../test/fixtures";
import { presetLengths, presetName, resetPresetsForTests, summaryText } from "./presets";

beforeEach(() => resetPresetsForTests());
afterEach(() => clearMocks());

const idle = { state: "idle", name: "Classic", minutes: 25, finish: "15:20", strip: false } as const;

test("summary_idle_text_name_tooltip", () => {
  expect(summaryText(idle)).toEqual({
    visible: "Classic · 25 min · ends 15:20",
    short: "25 min · ends 15:20",
    name: "Preset Classic, 25 minutes, ends 15:20. Change preset",
    tooltip: "Change preset",
  });
});

test("summary_idle_strip_drops_minutes", () => {
  const text = summaryText({ ...idle, strip: true });
  expect(text.visible).toBe("Classic · ends 15:20");
  expect(text.short).toBe("ends 15:20");
  expect(text.name).toBe("Preset Classic, 25 minutes, ends 15:20. Change preset");
});

test("summary_running_ends_from_view_finish", () => {
  expect(summaryText({ ...idle, state: "running" })).toEqual({
    visible: "Classic · ends 15:20",
    short: "ends 15:20",
    name: "Preset Classic, ends 15:20. Preset details",
    tooltip: "Preset details",
  });
});

test("summary_paused_uses_planned_min", () => {
  expect(summaryText({ ...idle, state: "paused", finish: null })).toEqual({
    visible: "Classic · 25 min",
    short: "25 min",
    name: "Preset Classic, 25 minutes, paused. Preset details",
    tooltip: "Preset details",
  });
});

test("summary_leaves_out_ends_when_finish_is_missing", () => {
  expect(summaryText({ ...idle, finish: null }).visible).toBe("Classic · 25 min");
  expect(summaryText({ ...idle, finish: null, minutes: undefined }).visible).toBe("Classic");
  expect(summaryText({ ...idle, minutes: 1 }).name).toContain("1 minute,");
});

test("preset_name_covers_every_preset", () => {
  expect(presetName("classic")).toBe("Classic");
  expect(presetName("fifty_ten")).toBe("50/10");
  expect(presetName("deep_block")).toBe("Deep Block");
  expect(presetName("custom")).toBe("Custom");
  expect(presetName("quick")).toBe("Just 2 minutes");
});

test("preset_lengths_are_read_once_per_launch", async () => {
  const backend = mockBackend();
  const first = await presetLengths();
  await presetLengths();
  await settle();
  expect(first).toHaveLength(3);
  expect(backend.calls.filter((call) => call.cmd === "presets_get")).toHaveLength(1);
});
