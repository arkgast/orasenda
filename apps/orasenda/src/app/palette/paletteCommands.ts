import type { Command } from "@orasenda/ui";
import {
  presetChoices,
  presetMeta,
  presetName,
  selectedPreset,
} from "../../features/today/presets";
import type {
  DisplayInfo,
  NotificationStatus,
  PresetEntry,
  Settings,
  Theme,
  TimerView_Serialize,
} from "../../ipc/bindings";
import { PAGE_ORDER } from "../PagesButton";

export type PaletteInput = {
  view: TimerView_Serialize | null;
  settings: Settings | null;
  presets: PresetEntry[];
  displays: DisplayInfo[];
  notifications: NotificationStatus;
};

const THEMES: ReadonlyArray<{ theme: Theme; label: string }> = [
  { theme: "system", label: "Match system" },
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

function sessionCommands(input: PaletteInput): Command[] {
  const { view, settings, presets } = input;
  if (!view) return [];
  if (view.state === "idle") {
    const preset = selectedPreset(presets, settings);
    const start = preset
      ? `Start focus · ${presetName(preset)} ${preset.focusMin} min`
      : "Start focus";
    return [
      { id: "start", label: start, shortcut: "⌘↩" },
      { id: "quick", label: "Just 2 minutes", shortcut: "⇧⌘↩" },
    ];
  }
  return [
    view.state === "paused"
      ? { id: "resume", label: "Resume session" }
      : { id: "pause", label: "Pause session" },
    { id: "end", label: "End session", shortcut: "⌘." },
  ];
}

function focusViewCommands(displays: DisplayInfo[]): Command[] {
  if (displays.length === 0) return [];
  const full = displays.map((display, index): Command => {
    const label = displays.length === 1 ? "Full screen" : `Full screen on ${display.name}`;
    return {
      id: `fullScreen:${display.id}`,
      label,
      ...(index === 0 ? { shortcut: "⇧⌘F" } : {}),
    };
  });
  return [...full, { id: "floater", label: "Floating timer", shortcut: "⇧⌘T" }];
}

function settingsCommands(input: PaletteInput): Command[] {
  const { settings, presets, view } = input;
  if (!settings) return [];
  const rows: Command[] = [];
  if (view?.state === "idle") {
    for (const choice of presetChoices(settings, presets)) {
      if (choice.checked) continue;
      const entry = presets.find((p) => p.id === choice.presetId);
      rows.push({
        id: `preset:${choice.presetId}`,
        label:
          `Use preset: ${choice.label} ${entry ? presetMeta(entry).replace(" / ", "/") : ""}`.trim(),
      });
    }
  }
  return rows;
}

function preferenceCommands(input: PaletteInput): Command[] {
  const { settings, notifications } = input;
  if (!settings) return [];
  const rows: Command[] = THEMES.filter(({ theme }) => theme !== settings.theme).map(
    ({ theme, label }) => ({ id: `theme:${theme}`, label: `Theme: ${label}` }),
  );
  if (notifications !== "unavailable") {
    rows.push({
      id: "notifications",
      label: settings.notifySessionEnd ? "Turn notifications off" : "Turn notifications on",
    });
  }
  return rows;
}

/** The commands available now, in the order the palette shows them (command-palette.md). */
export function paletteCommands(input: PaletteInput): Command[] {
  const pages = PAGE_ORDER.map(({ id, label }, index) => ({
    id: `page:${id}`,
    label: `Go to ${label}`,
    shortcut: `⌘${index + 1}`,
  }));
  return [
    ...sessionCommands(input),
    ...focusViewCommands(input.displays),
    ...settingsCommands(input),
    ...pages,
    ...preferenceCommands(input),
  ];
}
