import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { TaskCard } from "./task-card.tsx";

const MENU = {
  moveTargets: [
    { id: "today", label: "Today" },
    { id: "doing", label: "Doing" },
  ],
  onMove: () => {},
  onFrog: () => {},
  onRemove: () => {},
};

export function TaskCardSpecimen(): ReactElement {
  return (
    <>
      <Frame state="task-card-full-320" width={320} height={300}>
        <TaskCard
          title="Draft the chapter outline"
          frog
          estimate={3}
          done={1}
          tracked="0h 25m"
          project="Book"
          due="Due Friday"
          priority="high"
          tags={["writing", "draft", "extra"]}
          checklist={{ done: 2, total: 5 }}
          onOpen={() => {}}
          onSelect={() => {}}
          menu={MENU}
        />
      </Frame>
      <Frame state="task-card-selected-320" width={320} height={200}>
        <TaskCard
          title="Reply to the editor"
          type="shallow"
          selected
          onOpen={() => {}}
          onSelect={() => {}}
        />
      </Frame>
      <Frame state="task-card-active-over-estimate-320" width={320} height={200}>
        <TaskCard title="Edit chapter two" estimate={2} done={4} active onOpen={() => {}} />
      </Frame>
      <Frame state="task-card-disabled-320" width={320} height={160}>
        <TaskCard title="Archive the old drafts" disabled onOpen={() => {}} />
      </Frame>
      <Frame state="task-row-420" width={420} height={220}>
        <div className="flex flex-col gap-2">
          <TaskCard
            title="Plan the week"
            density="row"
            estimate={2}
            onOpen={() => {}}
            onSelect={() => {}}
            menu={MENU}
          />
          <TaskCard
            title="Call the dentist"
            type="shallow"
            density="row"
            selected
            onOpen={() => {}}
            onSelect={() => {}}
          />
          <TaskCard
            title="A very long task title that does not fit on a single line of the narrow list at all"
            density="row"
            frog
            estimate={3}
            active
            onOpen={() => {}}
          />
        </div>
      </Frame>
      <Frame state="task-row-selected-no-estimate-217" width={217} height={160}>
        <div className="flex flex-col gap-2">
          <TaskCard title="Plan the week" density="row" selected onSelect={() => {}} menu={MENU} />
          <TaskCard
            title="Call the dentist"
            density="row"
            frog
            active
            onSelect={() => {}}
            menu={MENU}
          />
        </div>
      </Frame>
      <Frame state="task-row-read-only-360" width={360} height={100}>
        <TaskCard title="Shutdown preview" density="row" estimate={1} />
      </Frame>
    </>
  );
}
