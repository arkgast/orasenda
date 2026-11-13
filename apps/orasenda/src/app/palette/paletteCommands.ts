import { FIXED_KEYS, fixedDisplay, hintFor, pageAccelerator } from "@domain/keyboard/bindings";
import { PAGE_ORDER } from "@domain/navigation/PagesButton";
import { presetChoices, presetMeta, presetName, selectedPreset } from "@domain/presets/presets";
import type { Command } from "@orasenda/ui";
import type {
  ActionView,
  DisplayInfo,
  FixedKeyView,
  NotificationStatus,
  PresetEntry,
  Settings,
  Theme,
  TimerView_Serialize,
} from "@shared/ipc/bindings";

export type PaletteInput = {
  view: TimerView_Serialize | null;
  settings: Settings | null;
  presets: PresetEntry[];
  displays: DisplayInfo[];
  notifications: NotificationStatus;
  /** The registry's actions (`keyboard_state`): the palette's hints read them. */
  actions?: ReadonlyArray<ActionView>;
  /** The registry's fixed keys: the hints of Start focus, End session and the pages. */
  fixed?: ReadonlyArray<FixedKeyView>;
};

const THEMES: ReadonlyArray<{ theme: Theme; label: string }> = [
  { theme: "system", label: "Match system" },
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

/** `{ shortcut }` for a fixed key, or nothing before the registry answers. */
function fixedHint(
  input: PaletteInput,
  keys: string,
): { shortcut: string } | Record<string, never> {
  const shortcut = fixedDisplay(input.fixed ?? [], keys);
  return shortcut ? { shortcut } : {};
}

function sessionCommands(input: PaletteInput): Command[] {
  const { view, settings, presets } = input;
  if (!view) return [];
  if (view.state === "idle") {
    const preset = selectedPreset(presets, settings);
    const start = preset
      ? `Start focus · ${presetName(preset)} ${preset.focusMin} min`
      : "Start focus";
    return [
      { id: "start", label: start, ...fixedHint(input, FIXED_KEYS.start) },
      { id: "quick", label: "Just 2 minutes", ...fixedHint(input, FIXED_KEYS.quick) },
    ];
  }
  return [
    view.state === "paused"
      ? { id: "resume", label: "Resume session" }
      : { id: "pause", label: "Pause session" },
    { id: "end", label: "End session", ...fixedHint(input, FIXED_KEYS.end) },
  ];
}

/** The hint for a registry action, when it has keys to show. */
function hint(
  input: PaletteInput,
  id: ActionView["id"],
): { shortcut: string } | Record<string, never> {
  const keys = hintFor(input.actions?.find((action) => action.id === id));
  return keys ? { shortcut: keys } : {};
}

function captureCommand(input: PaletteInput): Command {
  return { id: "capture", label: "Capture a thought", ...hint(input, "capture") };
}

function focusViewCommands(input: PaletteInput): Command[] {
  const { displays } = input;
  if (displays.length === 0) return [];
  const full = displays.map((display, index): Command => {
    const label = displays.length === 1 ? "Full screen" : `Full screen on ${display.name}`;
    return {
      id: `fullScreen:${display.id}`,
      label,
      ...(index === 0 ? hint(input, "fullScreen") : {}),
    };
  });
  return [...full, { id: "floater", label: "Floating timer", ...hint(input, "floater") }];
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
    ...fixedHint(input, pageAccelerator(index + 1)),
  }));
  return [
    ...sessionCommands(input),
    captureCommand(input),
    ...focusViewCommands(input),
    ...settingsCommands(input),
    ...pages,
    ...preferenceCommands(input),
  ];
}
