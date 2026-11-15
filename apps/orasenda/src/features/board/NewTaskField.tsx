import { Input } from "@orasenda/ui";
import { useRef, useState } from "react";

export const NEW_TASK_ID = "board-new-task";

/** Backlog's New task field: Enter adds and keeps the field ready, Esc leaves. */
export function NewTaskField({
  add,
  leave,
}: {
  add(title: string): Promise<boolean>;
  leave(): void;
}) {
  const [value, setValue] = useState("");
  const pending = useRef(false);
  return (
    <Input
      id={NEW_TASK_ID}
      label="New task"
      value={value}
      maxLength={200}
      autoComplete="off"
      onChange={(event) => setValue(event.target.value)}
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
