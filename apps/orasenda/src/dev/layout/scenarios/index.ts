import type { Handler } from "./backend";
import { BACKUPS_SCENARIOS } from "./backups";
import { BOARD_SCENARIOS } from "./board";
import { DATA } from "./data";
import { FOCUS } from "./focus";
import { INBOX } from "./inbox";
import { KEYBOARD_SCENARIOS } from "./keyboard";
import { ROUTINES_SCENARIOS } from "./routines";
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
  ...INBOX,
  ...DATA,
  ...BACKUPS_SCENARIOS,
  ...YOUR_DATA,
  ...ROUTINES_SCENARIOS,
  ...BOARD_SCENARIOS,
};

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
