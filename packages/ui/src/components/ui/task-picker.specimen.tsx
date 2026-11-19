import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { TaskPicker, type TaskPickerOption } from "./task-picker.tsx";

const OPTIONS: TaskPickerOption[] = [
  { id: "d1", title: "Draft the chapter 3 outline", order: 0, laneLabel: "Doing", frog: true },
  { id: "d2", title: "Review the budget", order: 0, laneLabel: "Doing", week: true },
  { id: "t1", title: "Write the weekly report", order: 1, laneLabel: "Today" },
  { id: "b1", title: "Plan the offsite", order: 2, laneLabel: "Backlog" },
];
const LONG_TITLE = "Prepare the quarterly planning notes for the whole team and send them round";

function Live(props: { initial?: string; create?: boolean }): ReactElement {
  const [id, setId] = useState<string | null>(props.initial ?? null);
  const picked = OPTIONS.find((o) => o.id === id);
  return (
    <TaskPicker
      task={picked ? { id: picked.id, title: picked.title } : undefined}
      options={OPTIONS}
      onPick={setId}
      onCreate={props.create ? () => {} : undefined}
    />
  );
}

export function TaskPickerSpecimen(): ReactElement {
  return (
    <>
      <Frame state="task-picker-rest-360" width={360} height={80}>
        <Live />
      </Frame>
      <Frame state="task-picker-chosen-360" width={360} height={80}>
        <Live initial="d1" />
      </Frame>
      <Frame state="task-picker-long-title-360" width={360} height={80}>
        <TaskPicker task={{ id: "x", title: LONG_TITLE }} options={OPTIONS} onPick={() => {}} />
      </Frame>
      <Frame state="task-picker-rest-900" width={900} height={80}>
        <Live />
      </Frame>
      {/* Open it and type: a week row, and the add row active (Selected) for a query that matches nothing. */}
      <Frame state="task-picker-create-360" width={360} height={320}>
        <Live create />
      </Frame>
      {/* Last on the page, so a test can scroll it to the bottom of a small window. */}
      <Frame state="task-picker-bottom" width={300} height={80}>
        <Live />
      </Frame>
    </>
  );
}
