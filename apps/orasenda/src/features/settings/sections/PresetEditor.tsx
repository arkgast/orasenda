import { Button, Input } from "@orasenda/ui";
import { useEffect, useState } from "react";
import type { PresetEntry } from "../../../ipc/bindings";
import type { EditField, FieldErrors } from "../usePresets";

type FieldProps = {
  id: string;
  label: string;
  helper: string;
  saved: string;
  unit?: string;
  numeric?: boolean;
  error?: string;
  disabled: boolean;
  onCommit: (value: string) => void;
  onRevert: () => void;
};

/** One field: saves on blur or Return, restores the saved value on Esc. */
function Field({ saved, numeric, onCommit, onRevert, ...rest }: FieldProps) {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    if (draft !== saved) onCommit(draft);
  };
  return (
    <Input
      id={rest.id}
      label={rest.label}
      helper={rest.helper}
      unit={rest.unit}
      error={rest.error}
      disabled={rest.disabled}
      value={draft}
      inputMode={numeric ? "numeric" : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          setDraft(saved);
          onRevert();
        }
      }}
    />
  );
}

type Props = {
  preset: PresetEntry;
  errors: FieldErrors;
  disabled: boolean;
  /** Focus the Name field when the editor opens (a new preset). */
  focusName: boolean;
  onSave: (field: EditField, value: string) => void;
  onClearError: (field: EditField) => void;
  onDone: () => void;
};

export function PresetEditor({
  preset,
  errors,
  disabled,
  focusName,
  onSave,
  onClearError,
  onDone,
}: Props) {
  const base = `preset-${preset.id}`;
  useEffect(() => {
    if (focusName) document.getElementById(`${base}-name`)?.focus();
  }, [focusName, base]);
  const field = (
    key: EditField,
    label: string,
    helper: string,
    saved: string,
    extra: { unit?: string; numeric?: boolean } = {},
  ) => (
    <Field
      id={`${base}-${key}`}
      label={label}
      helper={helper}
      saved={saved}
      error={errors[key]}
      disabled={disabled}
      onCommit={(value) => onSave(key, value)}
      onRevert={() => onClearError(key)}
      {...extra}
    />
  );
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-1">
      <legend className="sr-only">{`Edit ${preset.name}`}</legend>
      {field("name", "Name", "Up to 40 characters.", preset.name)}
      {field("focusMin", "Focus", "5 to 180 minutes.", String(preset.focusMin), {
        unit: "min",
        numeric: true,
      })}
      {field("breakMin", "Break", "1 to 60 minutes.", String(preset.breakMin), {
        unit: "min",
        numeric: true,
      })}
      {field("longBreakMin", "Long break", "5 to 90 minutes.", String(preset.longBreakMin), {
        unit: "min",
        numeric: true,
      })}
      {field("rounds", "Long break after", "1 to 8 sessions.", String(preset.rounds), {
        numeric: true,
      })}
      <div>
        <Button variant="quiet" onClick={onDone} aria-label={`Done editing ${preset.name}`}>
          Done
        </Button>
      </div>
    </fieldset>
  );
}
