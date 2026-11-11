import { Choice, ChoiceGroup, Input, SettingsRow } from "@orasenda/ui";
import { useId } from "react";
import type { CustomSpec, Preset, Settings } from "../../../ipc/bindings";
import { BREAK_RANGE, BREAK_RANGE_HELP, FOCUS_RANGE, FOCUS_RANGE_HELP } from "../customRange";

export type Draft = { focus: string; break: string };
export type FieldKey = keyof Draft;

const PRESET_LABELS: Readonly<Record<Exclude<Preset, "custom">, string>> = {
  classic: "Classic 25/5",
  fifty_ten: "50/10",
  deep_block: "Deep Block 90",
  quick: "Quick",
};

const PRESET_ORDER: readonly Preset[] = ["classic", "fifty_ten", "deep_block", "custom"];

/** "Custom 45/10" shows the saved values, never a literal. */
export function presetLabel(settings: Pick<Settings, "preset" | "custom">): string {
  return settings.preset === "custom"
    ? `Custom ${settings.custom.focusMin}/${settings.custom.breakMin}`
    : PRESET_LABELS[settings.preset];
}

function customLabel(custom: CustomSpec): string {
  return `Custom ${custom.focusMin}/${custom.breakMin}`;
}

type Props = {
  settings: Settings;
  draft: Draft;
  /** The error text per field, or undefined. */
  errors: { focus?: string; break?: string };
  running: boolean;
  disabled: boolean;
  disabledReason?: string;
  presetStatus?: string;
  customStatus?: string;
  onPreset: (preset: Preset) => void;
  onDraft: (key: FieldKey, value: string) => void;
  onCommit: () => void;
  onRestore: (key: FieldKey) => void;
};

export function Timer({
  settings,
  draft,
  errors,
  running,
  disabled,
  disabledReason,
  presetStatus,
  customStatus,
  onPreset,
  onDraft,
  onCommit,
  onRestore,
}: Props) {
  const name = useId();
  const field = (
    key: FieldKey,
    label: string,
    id: string,
    help: string,
    range: typeof FOCUS_RANGE,
  ) => (
    <Input
      id={id}
      label={label}
      type="number"
      inputMode="numeric"
      unit="min"
      min={range.min}
      max={range.max}
      value={draft[key]}
      disabled={disabled}
      helper={help}
      error={errors[key]}
      onChange={(event) => onDraft(key, event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit();
        } else if (event.key === "Escape") {
          onRestore(key);
        } else if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          // Plain arrows step by 1 natively; with Shift they step by 5 (the draft only).
          event.preventDefault();
          const base = Number.parseInt(draft[key], 10);
          const from = Number.isNaN(base) ? range.min : base;
          const next = from + (event.key === "ArrowUp" ? 5 : -5);
          onDraft(key, String(Math.min(range.max, Math.max(range.min, next))));
        }
      }}
    />
  );
  return (
    <section id="settings-timer" aria-labelledby="settings-timer-heading">
      <h2 id="settings-timer-heading" tabIndex={-1} className="settings-heading">
        Timer
      </h2>
      {running ? (
        <p className="app-muted">A session is running. Changes apply to your next session.</p>
      ) : null}
      <SettingsRow
        id="preset"
        label="Preset"
        helper="New sessions start with this. Classic is Pomodoro-style."
        status={presetStatus}
        disabledReason={disabledReason}
      >
        <ChoiceGroup labelledBy="preset-label">
          {PRESET_ORDER.map((preset) => (
            <Choice
              key={preset}
              name={name}
              value={preset}
              checked={settings.preset === preset}
              disabled={disabled}
              onChange={() => onPreset(preset)}
            >
              {preset === "custom" ? customLabel(settings.custom) : PRESET_LABELS[preset]}
            </Choice>
          ))}
        </ChoiceGroup>
      </SettingsRow>
      <SettingsRow
        id="custom"
        label="Custom times"
        helper="Used when Custom is the preset. Typing doesn't switch presets. A value saves when you leave the field or press Return; Esc puts the saved value back."
        status={customStatus}
        disabledReason={disabledReason}
      >
        <div className="settings-fields">
          {field("focus", "Focus minutes", "focusMinutes", FOCUS_RANGE_HELP, FOCUS_RANGE)}
          {field("break", "Break minutes", "breakMinutes", BREAK_RANGE_HELP, BREAK_RANGE)}
        </div>
      </SettingsRow>
    </section>
  );
}
