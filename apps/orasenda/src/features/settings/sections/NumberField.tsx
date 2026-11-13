import { Input } from "@orasenda/ui";
import { useEffect, useState } from "react";
import { parseMinutes } from "../customRange";

export type NumberFieldProps = {
  id: string;
  label: string;
  unit: string;
  saved: number;
  range: { min: number; max: number };
  helper: string;
  /** "minutes" or "hours", for the range line. */
  plural: string;
  disabled: boolean;
  onCommit: (value: number) => void;
};

/** A whole-number field: saves on blur or Return, restores the saved value on Esc. */
export function NumberField({ saved, range, plural, onCommit, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(saved));
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setDraft(String(saved));
    setError(undefined);
  }, [saved]);
  const commit = () => {
    if (draft === String(saved)) {
      setError(undefined);
      return;
    }
    const value = parseMinutes(draft);
    if (value === null || value < range.min || value > range.max) {
      setError(`Between ${range.min} and ${range.max} ${plural}. Still using ${saved}.`);
      return;
    }
    setError(undefined);
    onCommit(value);
  };
  return (
    <Input
      id={rest.id}
      label={rest.label}
      unit={rest.unit}
      helper={rest.helper}
      error={error}
      disabled={rest.disabled}
      value={draft}
      inputMode="numeric"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          setDraft(String(saved));
          setError(undefined);
        }
      }}
    />
  );
}
