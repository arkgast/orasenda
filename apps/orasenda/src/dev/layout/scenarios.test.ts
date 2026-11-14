import { expect, test } from "vitest";
import { displaysFor, SCENARIO_NAMES, scenarioHandler } from "./scenarios";

const NAMES = [
  "idle",
  "ended",
  "recovered",
  "running",
  "paused",
  "storeEnded",
  "startError",
  "timerUnavailable",
  "starting",
  "settingsUnavailable",
  "yourData",
  "yourDataUnavailable",
  "yourDataLong",
  "deepWorkChecked",
  "deepRunning",
  "viewUnreadable",
  "presetSelectError",
  "closeError",
  "warning",
  "warningAuto",
  "autoStep",
  "breakShort",
  "breakLong",
  "breakPaused",
  "breakCap",
  "keepGoing",
  "breakOver",
  "breakEnded",
  "capLine",
  "captureError",
  "captureSaving",
];

const NEW_COMMANDS = [
  "timer_view",
  "displays_list",
  "focus_view_open",
  "focus_view_close",
  "main_show",
  "preset_select",
  "native_menu_popup",
  "keyboard_state",
  "capture_open",
  "capture_close",
  "capture_note",
];

test("scenarios_name_every_state_of_the_issue", () => {
  for (const name of NAMES) expect(SCENARIO_NAMES, name).toContain(name);
  expect(scenarioHandler("nope")).toBeUndefined();
});

test("scenarios_answer_core_commands", async () => {
  for (const name of SCENARIO_NAMES) {
    const handler = scenarioHandler(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    for (const cmd of ["timer_state", "settings_get", "app_info", ...NEW_COMMANDS]) {
      // A scenario answers a command with a value or a failure the app can show; never "unexpected command".
      const outcome = await Promise.race([
        Promise.resolve(handler(cmd, undefined)).then(
          () => "answered",
          (error: unknown) => (typeof error === "object" && error ? "failed" : "bad"),
        ),
        new Promise((done) => setTimeout(() => done("hung"), 50)),
      ]);
      // captureSaving holds capture_note open on purpose: the panel's saving state.
      const holds = name === "captureSaving" && cmd === "capture_note";
      expect(holds ? ["hung"] : ["answered", "failed"], `${name} ${cmd}`).toContain(outcome);
    }
  }
});

test("scenarios_refuse_an_unknown_command", () => {
  const handler = scenarioHandler("idle");
  expect(() => handler?.("nope", undefined)).toThrow("unexpected command nope");
});

test("scenarios_answer_the_view_the_state_names", async () => {
  expect(await scenarioHandler("running")?.("timer_view", undefined)).toMatchObject({
    state: "running",
  });
  expect(await scenarioHandler("paused")?.("timer_view", undefined)).toMatchObject({
    state: "paused",
  });
  expect(await scenarioHandler("idle")?.("timer_view", undefined)).toMatchObject({ state: "idle" });
  expect(await scenarioHandler("deepRunning")?.("timer_view", undefined)).toMatchObject({
    presetName: "Deep Work",
    remaining: "1:29:59",
  });
  await expect(
    Promise.resolve(scenarioHandler("viewUnreadable")?.("timer_view", undefined)),
  ).rejects.toMatchObject({ kind: "store" });
});

test("displays_for_clamps_to_one_to_three_main_first", () => {
  expect(displaysFor(0)).toHaveLength(1);
  expect(displaysFor(2).map((d) => d.hasMainWindow)).toEqual([true, false]);
  expect(displaysFor(3).map((d) => d.id)).toEqual(["1", "2", "3"]);
  expect(displaysFor(9)).toHaveLength(3);
});
