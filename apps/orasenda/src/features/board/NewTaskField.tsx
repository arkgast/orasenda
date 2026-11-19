import { Input } from "@orasenda/ui";
import type { Lane } from "@shared/ipc/bindings";
import { useRef, useState } from "react";

export const NEW_TASK_ID = "board-new-task";

/** The field's id: Backlog's keeps the plain one, another column's carries its lane. */
export const newTaskId = (lane: Lane): string =>
  lane === "backlog" ? NEW_TASK_ID : `${NEW_TASK_ID}-${lane}`;

/**
 * A New task field: Enter adds and keeps the field ready, Esc leaves. A column's header + opens
 * one with `onBlurEmpty`, which closes it when focus leaves it empty (`lost`: to nowhere).
 */
export function NewTaskField({
  id = NEW_TASK_ID,
  label = "New task",
  add,
  leave,
  onBlurEmpty,
}: {
  id?: string;
  label?: string;
  add(title: string): Promise<boolean>;
  leave(): void;
  onBlurEmpty?: (lost: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const pending = useRef(false);
  return (
    <Input
      id={id}
      label={label}
      value={value}
      maxLength={200}
      autoComplete="off"
      onChange={(event) => setValue(event.target.value)}
      onBlur={(event) => {
        if (onBlurEmpty && value === "") onBlurEmpty(event.relatedTarget === null);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          leave();
        } else if (event.key === "Enter") {
          event.preventDefault();
          const title = value.trim();
          if (!title || event.repeat || pending.current) return;
          pending.current = true;
          void add(title)
            .then((ok) => ok && setValue(""))
            .finally(() => {
              pending.current = false;
            });
        }
      }}
    />
  );
}
