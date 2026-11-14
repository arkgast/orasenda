import { Choice, DayPicker, Dialog, InlineNotice, Input } from "@orasenda/ui";
import { commands, type RoutineView_Serialize } from "@shared/ipc/bindings";
import { type ReactElement, useId, useState } from "react";
import {
  atMost,
  checkLine,
  type Errors,
  focusField,
  fromFieldTime,
  length,
  MAX_NAME,
  NAME_NEEDED,
  NO_ERRORS,
  refusalLine,
  toFieldTime,
} from "./editing";
import type { WriteFn } from "./useRoutines";

const EVERY_DAY = 127;
const TIME_NEEDED = "Pick a time, or choose Any time.";

type Props = {
  /** The routine to edit; none for a new one. */
  routine?: RoutineView_Serialize | null;
  write: WriteFn;
  onClose(): void;
  /** After a save that Rust accepted, with the routine's id. */
  onSaved?(id: string): void;
};

/**
 * The routine editor (spec §Editors): a name, a time of day or *Any time*, and the days it runs.
 * A save goes through the page's write chain; a refusal keeps the dialog open with what was typed,
 * an error under the field it is about and one line in the dialog's status row.
 */
export function RoutineEditor({ routine, write, onClose, onSaved }: Props): ReactElement {
  const ids = useId();
  const nameId = `${ids}-name`;
  const timeId = `${ids}-time`;
  const [name, setName] = useState(routine?.name ?? "");
  const [anyTime, setAnyTime] = useState(routine ? routine.timeOfDay === null : true);
  const [time, setTime] = useState(toFieldTime(routine?.timeOfDay ?? null));
  const [days, setDays] = useState(routine?.days ?? EVERY_DAY);
  const [errors, setErrors] = useState<Errors<"name" | "time">>(NO_ERRORS);
  const [saving, setSaving] = useState(false);

  const fieldError = (field: "name" | "time", text: string) => {
    setErrors({ fields: { [field]: text }, line: checkLine(field) });
    focusField(field === "name" ? nameId : timeId);
  };

  const save = () => {
    if (saving) return;
    const timeOfDay = anyTime ? null : fromFieldTime(time);
    if (!anyTime && timeOfDay === null) return fieldError("time", TIME_NEEDED);
    const draft = { name, timeOfDay, days };
    setSaving(true);
    setErrors(NO_ERRORS);
    void write(routine ? "routine_update" : "routine_create", () =>
      routine ? commands.routineUpdate(routine.id, draft) : commands.routineCreate(draft),
    ).then((outcome) => {
      setSaving(false);
      if (outcome.status === "ok") {
        onSaved?.(routine?.id ?? String(outcome.data));
        return onClose();
      }
      // A day mask of 0 is `empty` too, but the day picker always keeps one day on.
      if (outcome.error === "empty") return fieldError("name", NAME_NEEDED);
      // The name is the only text a routine has, so `tooLong` is about it.
      if (outcome.error === "tooLong" && length(name) > MAX_NAME) {
        return fieldError("name", atMost(MAX_NAME));
      }
      setErrors({
        fields: {},
        line: refusalLine(outcome.error, {
          full: "You have 30 routines, the most Orasenda keeps. Remove one to add another.",
          notFound: "This routine was removed, so the change wasn't saved.",
        }),
      });
    });
  };

  return (
    <Dialog
      title={routine ? "Edit routine" : "New routine"}
      confirmLabel={routine ? "Save" : "Add routine"}
      loading={saving}
      onConfirm={save}
      onCancel={onClose}
    >
      <div className="app-routines-editor">
        <Input
          id={nameId}
          label="Name"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          error={errors.fields.name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="app-routines-editor-time">
          <Input
            id={timeId}
            type="time"
            label="Time"
            helper="With a time, Orasenda can let you know when it's due."
            value={time}
            disabled={anyTime}
            error={anyTime ? undefined : errors.fields.time}
            onChange={(event) => setTime(event.target.value)}
          />
          <Choice
            type="checkbox"
            checked={anyTime}
            onChange={(event) => setAnyTime(event.target.checked)}
          >
            Any time
          </Choice>
        </div>
        <DayPicker
          label="Repeat on"
          value={days}
          onChange={setDays}
          helper={routine && days === routine.days ? routine.daysLabel : undefined}
        />
      </div>
      <InlineNotice variant="row" tone={errors.line ? "attention" : "neutral"}>
        {errors.line}
      </InlineNotice>
    </Dialog>
  );
}
