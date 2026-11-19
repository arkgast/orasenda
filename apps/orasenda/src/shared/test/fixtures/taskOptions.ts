import type { TaskPickerOption } from "@orasenda/ui";

const LANES = {
  doing: { name: "Doing", order: 0 },
  today: { name: "Today", order: 1 },
  backlog: { name: "Backlog", order: 2 },
} as const;

/** A task option as `taskOptions` builds it for the default columns. */
export function taskOption(
  id: string,
  title: string,
  lane: keyof typeof LANES,
  frog = false,
): TaskPickerOption {
  const { name, order } = LANES[lane];
  return { id, title, order, laneLabel: name, frog: frog || undefined };
}
