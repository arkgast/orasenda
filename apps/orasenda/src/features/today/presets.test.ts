import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { DEEP, mockBackend, PRESETS, SETTINGS, settle } from "../../test/fixtures";
import {
  presetChoices,
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

test("preset_choices_four_rows_saved_checked", () => {
  const extra = {
    ...PRESETS[0],
    id: "0192f6a0-0000-7000-8000-000000000009",
    name: "Quiet",
    focusMin: 40,
  };
  const rows = presetChoices({ ...SETTINGS, presetId: DEEP }, [...PRESETS, extra]);
  expect(rows).toEqual([
    { presetId: PRESETS[0].id, label: "Gentle Start", meta: "15 / 5", checked: false },
    { presetId: PRESETS[1].id, label: "Steady Focus", meta: "25 / 5", checked: false },
    { presetId: DEEP, label: "Deep Work", meta: "90 / 15", checked: true },
    { presetId: extra.id, label: "Quiet", meta: "40 / 5", checked: false },
  ]);
});

test("preset_choices_check_the_first_when_the_saved_one_is_gone", () => {
  const rows = presetChoices({ ...SETTINGS, presetId: "gone" }, PRESETS);
  expect(rows.map((row) => row.checked)).toEqual([true, false, false]);
});
