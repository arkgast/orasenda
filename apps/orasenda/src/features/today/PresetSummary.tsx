import {
  Button,
  describeShortcut,
  Icon,
  PopoverMenu,
  type PopoverMenuItem,
  Tooltip,
} from "@orasenda/ui";
import type { BreakKind, Settings } from "@shared/ipc/bindings";
import { type ReactElement, useId, useRef, useState } from "react";
import {
  presetChoices,
  presetMeta,
  selectedPreset,
  summaryText,
  usePresets,
  usePresetsFailed,
} from "./presets";

type Props = {
  state: "idle" | "running" | "paused";
  /** The saved settings; `null` until they load (or when they failed to). */
  settings: Settings | null;
  /** The settings failed to load: the summary says so instead of waiting. */
  settingsFailed: boolean;
  /** The running session's preset snapshot and planned length, from the view. */
  session: {
    presetId: string | null;
    presetName: string | null;
    quick: boolean;
    breakKind?: BreakKind | null;
    breakMin: number | null;
    plannedMin: number | null;
    finish: string | null;
  } | null;
  /** The next session's finish from the clock tick, while idle. */
  idleFinish: string | null;
  strip: boolean;
  onChoose(presetId: string): void;
  /** Today's "Edit presets in Settings" row; without it (the Focus window) the menu has no such row. */
  onOpenSettings?: () => void;
  /** Single keys are on: P opens the popover, and the button and menu say so. */
  singleKeys?: boolean;
  /** Counts P presses from the page; each new count opens the popover. */
  openRequest?: number;
};

const SETTINGS_ID = "settings";

/** The preset summary: a text button with a chevron that opens the preset popover. */
export function PresetSummary({
  state,
  settings,
  settingsFailed,
  session,
  idleFinish,
  strip,
  onChoose,
  onOpenSettings,
  singleKeys = false,
  openRequest = 0,
}: Props): ReactElement {
  const presets = usePresets();
  const presetsFailed = usePresetsFailed();
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [seenRequest, setSeenRequest] = useState(openRequest);
  const idle = state === "idle";
  const ready = !(idle && (!settings || presets.length === 0));
  if (seenRequest !== openRequest) {
    setSeenRequest(openRequest);
    if (ready) setOpen(true);
  }

  if (idle && (!settings || presets.length === 0) && !settingsFailed && !presetsFailed) {
    // Still loading: the cell keeps its place and says nothing.
    return <div data-slot="preset-summary" className="today-preset-anchor" />;
  }
  if (idle && (!settings || presets.length === 0)) {
    return (
      <div data-slot="preset-summary" className="@container w-full">
        <span className="today-preset-anchor">
          <Button variant="ghost" className="max-w-full whitespace-nowrap" aria-disabled="true">
            Presets unavailable
          </Button>
        </span>
      </div>
    );
  }

  // Idle names the selected library preset; a session names its snapshot, which an edit or a
  // removal in the library never changes.
  const selected = selectedPreset(presets, settings);
  const name = idle ? (selected?.name ?? "") : (session?.presetName ?? selected?.name ?? "");
  const minutes = idle ? selected?.focusMin : (session?.plannedMin ?? undefined);
  const text = summaryText({
    state,
    name,
    minutes,
    finish: idle ? idleFinish : (session?.finish ?? null),
    strip,
    breakKind: idle ? null : (session?.breakKind ?? null),
  });

  const checked = idle ? selected?.id : (session?.presetId ?? null);
  // A session's snapshot may name a preset the library no longer has: then no radio is checked.
  const rows =
    settings && idle
      ? presetChoices(settings, presets)
      : presets.map((entry) => ({
          presetId: entry.id,
          label: entry.name,
          meta: presetMeta(entry),
          checked: entry.id === checked,
        }));
  const items: PopoverMenuItem[] = [
    ...rows.map((row) => ({
      id: row.presetId,
      label: row.label,
      meta: row.meta,
      kind: "radio" as const,
      checked: row.checked,
    })),
    ...(onOpenSettings
      ? [{ id: SETTINGS_ID, label: "Edit presets in Settings", meta: "⌘,", kind: "link" as const }]
      : []),
  ];
  const heading = idle
    ? "Preset for the next session"
    : session?.quick || session?.breakKind || session?.breakMin == null || minutes === undefined
      ? name
      : `${name} · ${minutes} / ${session.breakMin}`;

  return (
    <div data-slot="preset-summary" className="@container w-full">
      <span ref={anchor} className="today-preset-anchor">
        <Tooltip label={text.tooltip} shortcut={singleKeys ? "P" : undefined}>
          <Button
            variant="ghost"
            className="max-w-full whitespace-nowrap"
            aria-label={text.name}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-keyshortcuts={singleKeys ? describeShortcut("P").aria : undefined}
            aria-controls={open ? menuId : undefined}
            onClick={() => setOpen((was) => !was)}
          >
            <span data-slot="preset-summary-full" className="@max-start-compact:sr-only">
              {text.visible}
            </span>
            <span
              data-slot="preset-summary-short"
              aria-hidden="true"
              className="hidden @max-start-compact:inline"
            >
              {text.short}
            </span>
            <span className="today-preset-chevron">
              <Icon name="chevron" size="md" />
            </span>
          </Button>
        </Tooltip>
      </span>
      {open ? (
        <PopoverMenu
          id={menuId}
          anchor={anchor}
          heading={heading}
          description={
            idle ? "Choosing one applies it and closes." : "Presets can change between sessions."
          }
          items={items}
          readOnly={!idle}
          singleKeys={singleKeys}
          onSelect={(id) => {
            if (id === SETTINGS_ID) onOpenSettings?.();
            else onChoose(id);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
