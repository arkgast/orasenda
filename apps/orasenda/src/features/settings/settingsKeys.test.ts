import type { Settings } from "@shared/ipc/bindings";
import { SETTINGS } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { backTo, changedKeys, FAILURE_NAME, type Key, withKeys } from "./settingsKeys";

const CASES: { patch: Partial<Settings>; key: Key; line: string }[] = [
  {
    patch: { extensionCap: 3 },
    key: "extensionCap",
    line: "Extra 10 minutes wasn't saved. Back to twice.",
  },
  {
    patch: { autoContinue: true },
    key: "autoContinue",
    line: "Keep going automatically wasn't saved. Back to off.",
  },
  {
    patch: { longestFocusMin: 120 },
    key: "longestFocusMin",
    line: "Longest focus wasn't saved. Back to 90 minutes.",
  },
  {
    patch: { deepCapOn: false },
    key: "deepCapOn",
    line: "Deep-hours note wasn't saved. Back to on.",
  },
  {
    patch: { deepCapHours: 6 },
    key: "deepCapHours",
    line: "Deep-hours cap wasn't saved. Back to 4 hours.",
  },
];

test("cadence_field_failure_lines", () => {
  for (const { patch, key, line } of CASES) {
    const sent = { ...SETTINGS, ...patch };
    expect(changedKeys(sent, SETTINGS)).toEqual([key]);
    const name = FAILURE_NAME[key];
    expect(`${name.subject} ${name.verb} saved. Back to ${backTo(key, SETTINGS, [])}.`).toBe(line);
    expect(line).not.toContain("!");
    expect(withKeys(SETTINGS, sent, [key])).toEqual(sent);
  }
});
