import type { Handler } from "./backend";
import { BACKUPS_SCENARIOS } from "./backups";
import { BOARD } from "./board";
import { DATA } from "./data";
import { FOCUS } from "./focus";
import { KEYBOARD_SCENARIOS } from "./keyboard";
import { SETTINGS_SCENARIOS } from "./settings";
import { TIMER } from "./timer";
import { TODAY } from "./today";
import { YOUR_DATA } from "./yourData";

export type { Handler } from "./backend";
export { displaysFor } from "./backend";

const SCENARIOS: Record<string, Handler> = {
  ...TIMER,
  ...SETTINGS_SCENARIOS,
  ...TODAY,
  ...KEYBOARD_SCENARIOS,
  ...FOCUS,
  ...BOARD,
  ...DATA,
  ...BACKUPS_SCENARIOS,
  ...YOUR_DATA,
};

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
