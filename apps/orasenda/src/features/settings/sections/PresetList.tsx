import { Button, Choice, ChoiceGroup } from "@orasenda/ui";
import { useId } from "react";
import type { PresetEntry } from "../../../ipc/bindings";
import type { PresetEditing } from "../usePresets";
import { PresetEditor } from "./PresetEditor";

/** "25 / 5 · long 15 after 4": a preset's lengths in one line. */
export function presetDetail(preset: PresetEntry): string {
  return `${preset.focusMin} / ${preset.breakMin} · long ${preset.longBreakMin} after ${preset.rounds}`;
}

type Props = {
  presets: PresetEntry[];
  selectedId: string | undefined;
  editor: PresetEditing;
  disabled: boolean;
  locked: boolean;
  onPreset: (presetId: string) => void;
};

/** The library: a radio per preset with Edit and Remove, the editor under the open one. */
export function PresetList({ presets, selectedId, editor, disabled, locked, onPreset }: Props) {
  const group = useId();
  const removeWhy = `${group}-remove-why`;
  const addWhy = `${group}-add-why`;
  const restoreWhy = `${group}-restore-why`;
  return (
    <>
      <ChoiceGroup legend="Preset library" legendClassName="sr-only">
        {presets.map((preset) => {
          const open = editor.editing === preset.id;
          return (
            <div key={preset.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Choice
                    long
                    id={`preset-${preset.id}-radio`}
                    name={group}
                    value={preset.id}
                    description={presetDetail(preset)}
                    checked={selectedId === preset.id}
                    disabled={disabled}
                    onChange={() => onPreset(preset.id)}
                  >
                    {preset.name}
                  </Choice>
                </div>
                <Button
                  variant="ghost"
                  id={`preset-${preset.id}-edit`}
                  aria-label={`Edit ${preset.name}`}
                  aria-expanded={open}
                  disabled={locked}
                  onClick={() => editor.open(open ? null : preset.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Remove ${preset.name}`}
                  aria-disabled={!editor.canRemove}
                  aria-describedby={editor.canRemove ? undefined : removeWhy}
                  disabled={locked}
                  onClick={() => editor.remove(preset.id)}
                >
                  Remove
                </Button>
              </div>
              {open ? (
                <PresetEditor
                  preset={preset}
                  errors={editor.errors}
                  disabled={locked}
                  focusName={editor.focusName}
                  onSave={(field, value) => editor.save(preset.id, field, value)}
                  onClearError={editor.clearError}
                  onDone={() => {
                    editor.open(null);
                    document.getElementById(`preset-${preset.id}-edit`)?.focus();
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </ChoiceGroup>
      {editor.canRemove ? null : (
        <p id={removeWhy} className="app-muted">
          At least one preset stays.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-disabled={!editor.canAdd}
          aria-describedby={editor.canAdd ? undefined : addWhy}
          disabled={locked}
          onClick={() => editor.add()}
        >
          Add preset
        </Button>
        <Button
          aria-disabled={!editor.canRestore}
          aria-describedby={editor.canRestore ? undefined : restoreWhy}
          disabled={locked}
          onClick={() => editor.restore()}
        >
          Restore default presets
        </Button>
      </div>
      {editor.canAdd ? null : (
        <p id={addWhy} className="app-muted">
          Up to 12 presets.
        </p>
      )}
      {editor.canRestore ? null : (
        <p id={restoreWhy} className="app-muted">
          The default presets are all here.
        </p>
      )}
    </>
  );
}
