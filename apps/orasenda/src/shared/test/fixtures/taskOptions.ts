import type { TaskPickerOption } from "@orasenda/ui";

const LANE_NAMES = { doing: "Doing", today: "Today", backlog: "Backlog" } as const;

/** A task option as `taskOptions` builds it for a palette or picker. */
export function taskOption(
  id: string,
  title: string,
  lane: keyof typeof LANE_NAMES,
  frog = false,
): TaskPickerOption {
  return { id, title, lane, laneLabel: LANE_NAMES[lane], frog: frog || undefined };
}
