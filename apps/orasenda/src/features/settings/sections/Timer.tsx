import { Choice, ChoiceGroup, SettingsRow } from "@orasenda/ui";
import { useId } from "react";
import type { PresetEntry, Settings } from "../../../ipc/bindings";
import { selectedPreset } from "../../today/presets";

/** The selected preset's name: the Settings index value and the failure line's "Back to". */
export function presetLabel(presets: PresetEntry[], settings: Pick<Settings, "presetId">): string {
  return selectedPreset(presets, settings)?.name ?? "";
}

/** "25 / 5 · long 15 after 4": a preset's lengths in one line. */
export function presetDetail(preset: PresetEntry): string {
  return `${preset.focusMin} / ${preset.breakMin} · long ${preset.longBreakMin} after ${preset.rounds}`;
}

type Props = {
  settings: Settings;
  /** The live presets, in order. */
  presets: PresetEntry[];
  /** presets_list failed: say so instead of showing nothing. */
  presetsFailed?: boolean;
  running: boolean;
  disabled: boolean;
  disabledReason?: string;
  presetStatus?: string;
  onPreset: (presetId: string) => void;
};

export function Timer({
  settings,
  presets,
  presetsFailed = false,
  running,
  disabled,
  disabledReason,
  presetStatus,
  onPreset,
}: Props) {
  const name = useId();
  const selected = selectedPreset(presets, settings);
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
        helper="New sessions start with this. Steady Focus is Pomodoro-style."
        status={presetStatus}
        disabledReason={disabledReason}
      >
        {presetsFailed && presets.length === 0 ? (
          <p className="app-muted" role="status">
            Can't read your presets right now.
          </p>
        ) : null}
        <ChoiceGroup labelledBy="preset-label">
          {presets.map((preset) => (
            <Choice
              key={preset.id}
              long
              name={name}
              value={preset.id}
              description={presetDetail(preset)}
              checked={selected?.id === preset.id}
              disabled={disabled}
              onChange={() => onPreset(preset.id)}
            >
              {preset.name}
            </Choice>
          ))}
        </ChoiceGroup>
      </SettingsRow>
    </section>
  );
}
