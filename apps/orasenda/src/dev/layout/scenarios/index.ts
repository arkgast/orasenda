import type { Handler } from "./backend";
import { BACKUPS_SCENARIOS } from "./backups";
import { BOARD_SCENARIOS } from "./board";
import { BOARD_IMPORT_SCENARIOS } from "./boardImport";
import { BOARD_LONG_TITLE } from "./boardLongTitle";
import { BOARD_SHEET_SCENARIOS } from "./boardSheet";
import { DATA } from "./data";
import { FOCUS } from "./focus";
import { INBOX } from "./inbox";
import { KEYBOARD_SCENARIOS } from "./keyboard";
import { REVIEW_SCENARIOS } from "./review";
import { REVIEW_SHUTDOWN_SCENARIOS } from "./reviewShutdown";
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
  ...REVIEW_SCENARIOS,
  ...REVIEW_SHUTDOWN_SCENARIOS,
  ...BOARD_SCENARIOS,
  ...BOARD_LONG_TITLE,
  ...BOARD_SHEET_SCENARIOS,
  ...BOARD_IMPORT_SCENARIOS,
};

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
