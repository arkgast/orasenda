import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { TaskPicker, type TaskPickerOption } from "./task-picker.tsx";

const OPTIONS: TaskPickerOption[] = [
  { id: "d1", title: "Draft the chapter 3 outline", lane: "doing", laneLabel: "Doing", frog: true },
  { id: "d2", title: "Review the budget", lane: "doing", laneLabel: "Doing" },
  { id: "t1", title: "Write the weekly report", lane: "today", laneLabel: "Today" },
  { id: "b1", title: "Plan the offsite", lane: "backlog", laneLabel: "Backlog" },
];
const LONG_TITLE = "Prepare the quarterly planning notes for the whole team and send them round";

function Live(props: { initial?: string }): ReactElement {
  const [id, setId] = useState<string | null>(props.initial ?? null);
  const picked = OPTIONS.find((o) => o.id === id);
  return (
    <TaskPicker
      task={picked ? { id: picked.id, title: picked.title } : undefined}
      options={OPTIONS}
      onPick={setId}
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
    </>
  );
}
