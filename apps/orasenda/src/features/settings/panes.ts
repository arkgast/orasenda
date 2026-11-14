import type { SettingsTarget } from "@shared/ipc/bindings";

export type PaneId =
  | "general"
  | "timer"
  | "notifications"
  | "keyboard"
  | "about"
  | "data"
  | "backups";

/**
 * Every Settings pane, in the order the nav lists them. Append-only: a later task adds a pane
 * file, never an edit to the others. `targets` are the navigation targets that open the pane.
 */
export const PANES: readonly {
  id: PaneId;
  name: string;
  file: string;
  targets: SettingsTarget[];
}[] = [
  { id: "general", name: "General", file: "panes/General.tsx", targets: ["general"] },
  {
    id: "timer",
    name: "Timer",
    file: "panes/Timer.tsx",
    targets: ["timer", "focusMinutes", "breakMinutes", "keepGoing"],
  },
  {
    id: "notifications",
    name: "Notifications",
    file: "panes/Notifications.tsx",
    targets: ["notifications"],
  },
  { id: "keyboard", name: "Shortcuts", file: "panes/Shortcuts.tsx", targets: ["keyboard"] },
  { id: "about", name: "About", file: "panes/About.tsx", targets: ["about"] },
  { id: "data", name: "Your data", file: "panes/YourData.tsx", targets: ["data"] },
  { id: "backups", name: "Backups", file: "panes/Backups.tsx", targets: ["backups"] },
];

/** The nav's items: one stable array, so the nav does not re-measure on every render. */
export const PANE_ITEMS: { id: PaneId; name: string }[] = PANES.map(({ id, name }) => ({
  id,
  name,
}));

/** The pane a navigation target opens. */
export function paneFor(target: SettingsTarget): PaneId {
  return PANES.find((pane) => pane.targets.includes(target))?.id ?? "general";
}
