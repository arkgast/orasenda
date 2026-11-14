import { Input } from "@orasenda/ui";
import { useState } from "react";

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
          if (!title) return;
          void add(title).then((ok) => ok && setValue(""));
        }
      }}
    />
  );
}
