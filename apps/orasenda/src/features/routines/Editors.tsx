import type { HabitView_Serialize, RoutineView_Serialize } from "@shared/ipc/bindings";
import type { ReactElement } from "react";
import { HabitEditor } from "./HabitEditor";
import { RoutineEditor } from "./RoutineEditor";
import type { RoutinesView, WriteFn } from "./useRoutines";

/** The editor that is open: a routine's, or a habit's (new in `routineId`, or an existing one). */
export type Editing =
  | { kind: "routine"; routine: RoutineView_Serialize | null }
  | { kind: "habit"; habit: HabitView_Serialize | null; routineId: string | null; asStep: boolean };

/** The habit with `id`: a standalone one or a step in any routine. */
export function findHabit(view: RoutinesView, id: string): HabitView_Serialize | undefined {
  return (
    view.habits.find((h) => h.id === id) ??
    view.routines.flatMap((r) => r.habits).find((h) => h.id === id)
  );
}

type Props = {
  editing: Editing;
  view: RoutinesView;
  write: WriteFn;
  onClose(): void;
  onSaved(id: string): void;
};

/** One editor dialog at a time, for the page to mount while `editing` is set. */
export function Editor({ editing, view, write, onClose, onSaved }: Props): ReactElement {
  if (editing.kind === "routine") {
    return (
      <RoutineEditor routine={editing.routine} write={write} onClose={onClose} onSaved={onSaved} />
    );
  }
  return (
    <HabitEditor
      habit={editing.habit}
      routineId={editing.routineId}
      asStep={editing.asStep}
      routines={view.routines.map(({ id, name }) => ({ id, name }))}
      write={write}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
