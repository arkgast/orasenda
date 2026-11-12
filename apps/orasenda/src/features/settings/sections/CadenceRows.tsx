import { Choice, ChoiceGroup, Input, SettingsRow, WellnessNote } from "@orasenda/ui";
import { useEffect, useState } from "react";
import type { PresetEntry, Settings } from "../../../ipc/bindings";
import { parseMinutes } from "../customRange";

/** What a cadence row changes, and the save line that follows it. */
export type CadenceChange = (patch: Partial<Settings>, saved: string) => void;

const CAPS = [
  { value: 0, label: "Off", said: "off" },
  { value: 1, label: "Once", said: "once" },
  { value: 2, label: "Twice", said: "twice" },
  { value: 3, label: "3 times", said: "3 times" },
] as const;

export const LONGEST_RANGE = { min: 60, max: 150 };
export const DEEP_RANGE = { min: 2, max: 8 };

type NumberFieldProps = {
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
function NumberField({ saved, range, plural, onCommit, ...rest }: NumberFieldProps) {
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

type Props = {
  settings: Settings;
  /** The selected preset, for the "already reaches this" helper. */
  selected: PresetEntry | undefined;
  disabled: boolean;
  disabledReason?: string;
  status?: string;
  onChange: CadenceChange;
};

/** Settings › Timer, after the presets: extra time, the deep-hours cap, keeping going. */
export function CadenceRows({
  settings,
  selected,
  disabled,
  disabledReason,
  status,
  onChange,
}: Props) {
  const reaches = selected != null && selected.focusMin >= settings.longestFocusMin;
  return (
    <>
      <SettingsRow
        id="extension"
        label="Extra 10 minutes"
        helper={'How many times "+10 min" is offered in one session.'}
        status={status}
        disabledReason={disabledReason}
      >
        <ChoiceGroup legend="Extra 10 minutes" legendClassName="sr-only">
          {CAPS.map((cap) => (
            <Choice
              key={cap.value}
              name="extension-cap"
              value={String(cap.value)}
              checked={settings.extensionCap === cap.value}
              disabled={disabled}
              onChange={() =>
                onChange({ extensionCap: cap.value }, `Extra 10 minutes: ${cap.said}.`)
              }
            >
              {cap.label}
            </Choice>
          ))}
        </ChoiceGroup>
      </SettingsRow>
      <SettingsRow
        id="deep-cap"
        label="Deep-hours cap"
        helper="A calm note, once a day. Start is never blocked."
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={settings.deepCapOn}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              { deepCapOn: event.target.checked },
              `Deep-hours note: ${event.target.checked ? "on" : "off"}.`,
            )
          }
        >
          Note when today's focus passes
        </Choice>
        <NumberField
          id="deep-cap-hours"
          label="Hours"
          unit="hours"
          plural="hours"
          saved={settings.deepCapHours}
          range={DEEP_RANGE}
          helper={`${DEEP_RANGE.min} to ${DEEP_RANGE.max} hours.`}
          disabled={disabled}
          onCommit={(deepCapHours) =>
            onChange({ deepCapHours }, `Deep-hours cap: ${deepCapHours} hours.`)
          }
        />
      </SettingsRow>
      <SettingsRow
        id="auto-continue"
        label="Keep going"
        helper="When a session ends, keep going in 10-minute steps, with a break one click away."
        disabledReason={disabledReason}
      >
        <Choice
          id="keep-going-auto"
          type="checkbox"
          checked={settings.autoContinue}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              { autoContinue: event.target.checked },
              `Keep going automatically: ${event.target.checked ? "on" : "off"}.`,
            )
          }
        >
          Keep going automatically
        </Choice>
        <NumberField
          id="longest-focus"
          label="Longest focus"
          unit="min"
          plural="minutes"
          saved={settings.longestFocusMin}
          range={LONGEST_RANGE}
          helper={
            reaches
              ? `${selected.name} already reaches this, so no steps are added.`
              : "Steps stop here and the break starts."
          }
          disabled={disabled}
          onCommit={(longestFocusMin) =>
            onChange({ longestFocusMin }, `Longest focus: ${longestFocusMin} minutes.`)
          }
        />
      </SettingsRow>
      <SettingsRow
        id="suggestions"
        label="Break suggestions"
        helper="One calm idea in each break."
        disabledReason={disabledReason}
      >
        <WellnessNote as="p">
          Wellness suggestions, not medical advice. Some are marked optional or experimental where
          the evidence is thin.
        </WellnessNote>
      </SettingsRow>
    </>
  );
}
