import { expect, test } from "vitest";
import { SCENARIO_NAMES, scenarioHandler } from "./scenarios";

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
  "customChecked",
];

test("scenarios_name_every_state_of_the_issue", () => {
  for (const name of NAMES) expect(SCENARIO_NAMES, name).toContain(name);
  expect(scenarioHandler("nope")).toBeUndefined();
});

test("scenarios_answer_core_commands", async () => {
  for (const name of SCENARIO_NAMES) {
    const handler = scenarioHandler(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    for (const cmd of ["timer_state", "settings_get", "app_info"]) {
      // A scenario answers a command with a value or a failure the app can show; never "unexpected command".
      const outcome = await Promise.race([
        Promise.resolve(handler(cmd, undefined)).then(
          () => "answered",
          (error: unknown) => (typeof error === "object" && error ? "failed" : "bad"),
        ),
        new Promise((done) => setTimeout(() => done("hung"), 50)),
      ]);
      expect(["answered", "failed"], `${name} ${cmd}`).toContain(outcome);
    }
  }
});

test("scenarios_refuse_an_unknown_command", () => {
  const handler = scenarioHandler("idle");
  expect(() => handler?.("nope", undefined)).toThrow("unexpected command nope");
});
