import { SettingsRow } from "@orasenda/ui";
import type { PresetEntry, Settings } from "../../../ipc/bindings";
import { selectedPreset } from "../../today/presets";
import type { PresetEditing } from "../usePresets";
import { type CadenceChange, CadenceRows } from "./CadenceRows";
import { PresetList } from "./PresetList";

/** The selected preset's name: the Settings index value and the failure line's "Back to". */
export function presetLabel(presets: PresetEntry[], settings: Pick<Settings, "presetId">): string {
  return selectedPreset(presets, settings)?.name ?? "";
}

type Props = {
  settings: Settings;
  /** The live presets, in order. */
  presets: PresetEntry[];
  /** presets_list failed: say so instead of showing nothing. */
  presetsFailed?: boolean;
  running: boolean;
  disabled: boolean;
  /** Editing is off: the store is read-only or can't be written. */
  editLocked: boolean;
  disabledReason?: string;
  presetStatus?: string;
  cadenceStatus?: string;
  editor: PresetEditing;
  onPreset: (presetId: string) => void;
  onCadence: CadenceChange;
};

export function Timer({
  settings,
  presets,
  presetsFailed = false,
  running,
  disabled,
  editLocked,
  disabledReason,
  presetStatus,
  cadenceStatus,
  editor,
  onPreset,
  onCadence,
}: Props) {
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
        <PresetList
          presets={presets}
          selectedId={selected?.id}
          editor={editor}
          disabled={disabled}
          locked={editLocked}
          onPreset={onPreset}
        />
      </SettingsRow>
      <CadenceRows
        settings={settings}
        selected={selected}
        disabled={disabled}
        disabledReason={disabledReason}
        status={cadenceStatus}
        onChange={onCadence}
      />
    </section>
  );
}
