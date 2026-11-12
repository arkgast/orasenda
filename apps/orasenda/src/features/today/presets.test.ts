import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { DEEP, mockBackend, PRESETS, settle } from "../../test/fixtures";
import {
  presetMeta,
  presetName,
  presetsList,
  resetPresetsForTests,
  selectedPreset,
  summaryText,
} from "./presets";

beforeEach(() => resetPresetsForTests());
afterEach(() => clearMocks());

const idle = {
  state: "idle",
  name: "Steady Focus",
  minutes: 25,
  finish: "15:20",
  strip: false,
} as const;

test("summary_idle_text_name_tooltip", () => {
  expect(summaryText(idle)).toEqual({
    visible: "Steady Focus · 25 min · ends 15:20",
    short: "25 min · ends 15:20",
    name: "Preset Steady Focus, 25 minutes, ends 15:20. Change preset",
    tooltip: "Change preset",
  });
});

test("summary_idle_strip_drops_minutes", () => {
  const text = summaryText({ ...idle, strip: true });
  expect(text.visible).toBe("Steady Focus · ends 15:20");
  expect(text.short).toBe("ends 15:20");
  expect(text.name).toBe("Preset Steady Focus, 25 minutes, ends 15:20. Change preset");
});

test("summary_running_ends_from_view_finish", () => {
  expect(summaryText({ ...idle, state: "running" })).toEqual({
    visible: "Steady Focus · ends 15:20",
    short: "ends 15:20",
    name: "Preset Steady Focus, ends 15:20. Preset details",
    tooltip: "Preset details",
  });
});

test("summary_paused_uses_planned_min", () => {
  expect(summaryText({ ...idle, state: "paused", finish: null })).toEqual({
    visible: "Steady Focus · 25 min",
    short: "25 min",
    name: "Preset Steady Focus, 25 minutes, paused. Preset details",
    tooltip: "Preset details",
  });
});

test("summary_leaves_out_ends_when_finish_is_missing", () => {
  expect(summaryText({ ...idle, finish: null }).visible).toBe("Steady Focus · 25 min");
  expect(summaryText({ ...idle, finish: null, minutes: undefined }).visible).toBe("Steady Focus");
  expect(summaryText({ ...idle, minutes: 1 }).name).toContain("1 minute,");
});

test("preset_name_and_meta_read_the_entry", () => {
  const [gentle, steady, deep] = PRESETS;
  expect(gentle && presetName(gentle)).toBe("Gentle Start");
  expect(steady && presetMeta(steady)).toBe("25 / 5");
  expect(deep && presetMeta(deep)).toBe("90 / 15");
});

test("selected_preset_is_the_matching_entry_or_the_first", () => {
  expect(selectedPreset(PRESETS, { presetId: DEEP })?.name).toBe("Deep Work");
  expect(selectedPreset(PRESETS, { presetId: "gone" })?.name).toBe("Gentle Start");
  expect(selectedPreset(PRESETS, null)?.name).toBe("Gentle Start");
  expect(selectedPreset([], { presetId: DEEP })).toBeUndefined();
});

test("presets_are_read_once_per_launch", async () => {
  const backend = mockBackend();
  const first = await presetsList();
  await presetsList();
  await settle();
  expect(first).toHaveLength(3);
  expect(backend.calls.filter((call) => call.cmd === "presets_list")).toHaveLength(1);
});
