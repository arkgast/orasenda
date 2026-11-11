import { Button, PopoverMenu, type PopoverMenuItem, Tooltip } from "@orasenda/ui";
import { type ReactElement, useId, useRef, useState } from "react";
import { ChevronGlyph } from "../../app/glyphs";
import type { Preset, Settings } from "../../ipc/bindings";
import { lengthOf, presetName, summaryText, usePresetLengths } from "./presets";

type Props = {
  state: "idle" | "running" | "paused";
  /** The saved settings; `null` until they load (or when they failed to). */
  settings: Settings | null;
  /** The running session's preset and planned length, from the view. */
  session: { preset: Preset | null; plannedMin: number | null; finish: string | null } | null;
  /** The next session's finish from the clock tick, while idle. */
  idleFinish: string | null;
  strip: boolean;
  onChoose(preset: Preset): void;
  onOpenSettings(): void;
};

const CHOICES: readonly Preset[] = ["classic", "fifty_ten", "deep_block", "custom"];
const SETTINGS_ID = "settings";

/** The preset summary: a text button with a chevron that opens the preset popover. */
export function PresetSummary({
  state,
  settings,
  session,
  idleFinish,
  strip,
  onChoose,
  onOpenSettings,
}: Props): ReactElement {
  const lengths = usePresetLengths();
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const idle = state === "idle";

  if (idle && !settings) {
    return (
      <div data-slot="preset-summary" className="@container w-full">
        <span className="today-preset-anchor">
          <Button variant="ghost" aria-disabled="true">
            Presets unavailable
          </Button>
        </span>
      </div>
    );
  }

  const preset: Preset = idle
    ? (settings?.preset ?? "classic")
    : (session?.preset ?? settings?.preset ?? "classic");
  const minutes = idle
    ? lengthOf(preset, settings, lengths)?.focusMin
    : (session?.plannedMin ?? undefined);
  const text = summaryText({
    state,
    name: presetName(preset),
    minutes,
    finish: idle ? idleFinish : (session?.finish ?? null),
    strip,
  });

  const checked: Preset | null = preset === "quick" ? null : preset;
  const items: PopoverMenuItem[] = [
    ...CHOICES.map((choice) => {
      const length = lengthOf(choice, settings, lengths);
      return {
        id: choice,
        label: presetName(choice),
        meta: length ? `${length.focusMin} / ${length.breakMin}` : undefined,
        kind: "radio" as const,
        checked: choice === checked,
      };
    }),
    { id: SETTINGS_ID, label: "Edit times in Settings", meta: "⌘,", kind: "link" },
  ];
  const heading = idle
    ? "Preset for the next session"
    : preset === "quick"
      ? presetName("quick")
      : `${presetName(preset)} · ${minutes ?? ""} min`;

  return (
    <div data-slot="preset-summary" className="@container w-full">
      <span ref={anchor} className="today-preset-anchor">
        <Tooltip label={text.tooltip}>
          <Button
            variant="ghost"
            aria-label={text.name}
            aria-haspopup="menu"
            aria-expanded={open}
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
              <ChevronGlyph />
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
          onSelect={(id) => {
            if (id === SETTINGS_ID) onOpenSettings();
            else onChoose(id as Preset);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
