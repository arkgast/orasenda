import { Choice, ChoiceGroup, DayPicker, Dialog, InlineNotice, Input } from "@orasenda/ui";
import { commands, type HabitView_Serialize } from "@shared/ipc/bindings";
import { type ReactElement, useId, useState } from "react";
import {
  atMost,
  checkLine,
  type Errors,
  length,
  MAX_LONG,
  MAX_NAME,
  NAME_NEEDED,
  NO_ERRORS,
  refusalLine,
} from "./editing";
import { byId, useFocusAfter } from "./focusAfter";
import type { WriteFn } from "./useRoutines";

const EVERY_DAY = 127;

type Field = "name" | "whenText" | "whereText" | "anchor" | "twoMinute" | "identity";

/** The words for each field in "Not saved yet. Check the …". */
const WORDS: Record<Field, string> = {
  name: "name",
  whenText: "when field",
  whereText: "where field",
  anchor: "anchor",
  twoMinute: "2-minute version",
  identity: "identity",
};

/** The text fields in the order Rust checks them (R5 ruling 5), with their labels and limits. */
const FIELDS: { key: Field; label: string; max: number; helper?: string }[] = [
  { key: "name", label: "Name", max: MAX_NAME },
  {
    key: "whenText",
    label: "When",
    max: MAX_NAME,
    helper: "For example, at 7:00 or after breakfast.",
  },
  { key: "whereText", label: "Where", max: MAX_NAME, helper: "For example, in the kitchen." },
  {
    key: "anchor",
    label: "After",
    max: MAX_LONG,
    helper: "The habit this one follows, for example: I wake up.",
  },
  {
    key: "twoMinute",
    label: "2-minute version",
    max: MAX_LONG,
    helper: "The smallest way to start, for example: one sip.",
  },
  {
    key: "identity",
    label: "Identity",
    max: MAX_LONG,
    helper: "Who this makes you, in your words.",
  },
];

type Props = {
  /** The habit to edit; none for a new one. */
  habit?: HabitView_Serialize | null;
  /** For a new habit: the routine it starts in, or null for one on its own. */
  routineId?: string | null;
  /** The routines a new habit can belong to, in the person's order. */
  routines: { id: string; name: string }[];
  /** A new habit opened from a routine's *Add a step*: worded as a step. */
  asStep?: boolean;
  write: WriteFn;
  onClose(): void;
  onSaved?(id: string): void;
};

const textOf = (habit: HabitView_Serialize | null | undefined, key: Field) =>
  (habit ? habit[key] : null) ?? "";

/**
 * The habit editor (spec §Editors): name, when, where, anchor, 2-minute version, identity and
 * *Optional*. A habit on its own also has its days; a habit in a routine follows the routine's
 * days (R5 ruling 6). A new habit picks where it belongs; an existing one stays where it is.
 */
export function HabitEditor(props: Props): ReactElement {
  const { habit, routines, write, onClose, onSaved } = props;
  const ids = useId();
  const idOf = (key: Field) => `${ids}-${key}`;
  const [text, setText] = useState<Record<Field, string>>(
    () =>
      Object.fromEntries(FIELDS.map(({ key }) => [key, textOf(habit, key)])) as Record<
        Field,
        string
      >,
  );
  const [optional, setOptional] = useState(habit?.optional ?? false);
  const [routineId, setRoutineId] = useState<string | null>(
    habit ? habit.routineId : (props.routineId ?? null),
  );
  const [days, setDays] = useState(habit?.days ?? EVERY_DAY);
  const [errors, setErrors] = useState<Errors<Field>>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  // Focus moves once the error is drawn, so VoiceOver reads the field with it.
  const focus = useFocusAfter();
  // A new step moved to "On its own" is a habit again.
  const step = habit ? habit.routineId !== null : !!props.asStep && routineId !== null;
  const noun = step ? "step" : "habit";
  const routine = routines.find((r) => r.id === routineId) ?? null;

  const fieldError = (key: Field, message: string) => {
    setErrors({ fields: { [key]: message }, line: checkLine(WORDS[key]) });
    focus(byId(idOf(key)));
  };

  const save = () => {
    if (saving) return;
    const optionalText = (key: Field) => (text[key].trim() === "" ? null : text[key]);
    const draft = {
      name: text.name,
      whenText: optionalText("whenText"),
      whereText: optionalText("whereText"),
      anchor: optionalText("anchor"),
      twoMinute: optionalText("twoMinute"),
      identity: optionalText("identity"),
      optional,
      days: routineId === null ? days : null,
    };
    setSaving(true);
    setErrors(NO_ERRORS);
    void write(habit ? "habit_update" : "habit_create", () =>
      habit ? commands.habitUpdate(habit.id, draft) : commands.habitCreate(routineId, draft),
    ).then((outcome) => {
      setSaving(false);
      if (outcome.status === "ok") {
        onSaved?.(habit?.id ?? String(outcome.data));
        return onClose();
      }
      if (outcome.error === "empty") return fieldError("name", NAME_NEEDED);
      // `tooLong` names no field (R5 ruling 5): it is the first one over its limit, in Rust's order.
      const over = outcome.error === "tooLong" && FIELDS.find((f) => length(text[f.key]) > f.max);
      if (over) return fieldError(over.key, atMost(over.max));
      // The routine it was going into is gone: it is on its own until the person chooses again.
      if (outcome.error === "notFound" && !habit) setRoutineId(null);
      const tail = "the most Orasenda keeps. Remove one to add another.";
      setErrors({
        fields: {},
        line: refusalLine(outcome.error, {
          full: routine
            ? `${routine.name} has 20 steps, ${tail}`
            : `You have 30 habits on their own, ${tail}`,
          notFound: habit
            ? `This ${noun} was removed, so the change wasn't saved.`
            : "That routine was removed. Choose where this habit belongs again.",
        }),
      });
    });
  };

  return (
    <Dialog
      title={habit ? `Edit ${noun}` : `New ${noun}`}
      confirmLabel={habit ? "Save" : `Add ${noun}`}
      loading={saving}
      onConfirm={save}
      onCancel={onClose}
    >
      <div className="app-routines-editor">
        {habit ? (
          <div className="app-routines-editor-reads">
            <p className="m-0 text-label text-ink-muted uppercase">Reads now</p>
            <p className="app-routines-muted">{habit.intention}</p>
            {habit.anchorLine ? <p className="app-routines-muted">{habit.anchorLine}</p> : null}
          </div>
        ) : null}
        {FIELDS.map(({ key, label, max, helper }) => (
          <Input
            key={key}
            id={idOf(key)}
            label={label}
            helper={helper}
            value={text[key]}
            maxLength={max}
            autoComplete="off"
            error={errors.fields[key]}
            onChange={(event) => setText((now) => ({ ...now, [key]: event.target.value }))}
          />
        ))}
        <Choice
          type="checkbox"
          long
          description="Shown as optional in the list, to skip without a second thought."
          checked={optional}
          onChange={(event) => setOptional(event.target.checked)}
        >
          Optional
        </Choice>
        {!habit && routines.length > 0 ? (
          <ChoiceGroup legend="Belongs to">
            {[{ id: null, name: "On its own" }, ...routines].map((r) => (
              <Choice
                key={r.id ?? "own"}
                name={`${ids}-belongs`}
                value={r.id ?? ""}
                checked={routineId === r.id}
                onChange={() => setRoutineId(r.id)}
              >
                {r.name}
              </Choice>
            ))}
          </ChoiceGroup>
        ) : null}
        {routineId === null ? (
          <DayPicker
            label="Repeat on"
            value={days}
            onChange={setDays}
            helper={habit && days === habit.days ? (habit.daysLabel ?? undefined) : undefined}
          />
        ) : null}
      </div>
      <InlineNotice variant="row" tone={errors.line ? "attention" : "neutral"}>
        {errors.line}
      </InlineNotice>
    </Dialog>
  );
}
