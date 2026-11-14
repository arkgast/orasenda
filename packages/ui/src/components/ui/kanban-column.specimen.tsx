import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { KanbanColumn } from "./kanban-column.tsx";
import { TaskCard } from "./task-card.tsx";

const TITLES = ["Outline", "Draft", "Edit", "Proof", "Send", "Archive"];

function Cards({ n }: { n: number }): ReactElement {
  return (
    <>
      {TITLES.slice(0, n).map((title, i) => (
        <TaskCard key={title} title={title} estimate={2} done={i % 3} onOpen={() => {}} />
      ))}
    </>
  );
}

export function KanbanColumnSpecimen(): ReactElement {
  return (
    <>
      <Frame state="kanban-column-under-limit-280" width={280} height={420}>
        <KanbanColumn
          title="Today"
          count={2}
          limit={3}
          footer={<Button variant="quiet">Add task</Button>}
        >
          <Cards n={2} />
        </KanbanColumn>
      </Frame>
      <Frame state="kanban-column-at-limit-280" width={280} height={300}>
        <KanbanColumn title="Doing" count={1} limit={1}>
          <Cards n={1} />
        </KanbanColumn>
      </Frame>
      <Frame state="kanban-column-over-limit-280" width={280} height={460}>
        <KanbanColumn title="Today" count={4} limit={3}>
          <Cards n={4} />
        </KanbanColumn>
      </Frame>
      <Frame state="kanban-column-wide-scrolls-440" width={440} height={360}>
        <div className="flex h-full">
          <KanbanColumn title="Today" count={6} limit={8} width="wide" onToggle={() => {}}>
            <Cards n={6} />
          </KanbanColumn>
        </div>
      </Frame>
      <Frame state="kanban-board-folded-over-limit-300" width={300} height={200}>
        <div className="flex h-full gap-2">
          <KanbanColumn title="Today" count={4} limit={3} collapsed onToggle={() => {}} />
          <KanbanColumn title="Backlog" count={2} collapsed onToggle={() => {}} />
        </div>
      </Frame>
      <Frame state="kanban-column-empty-280" width={280} height={160}>
        <KanbanColumn title="Backlog" count={0} />
      </Frame>
      <Frame state="kanban-board-today-first-900" width={900} height={420}>
        <div className="flex h-full gap-2">
          <KanbanColumn title="Backlog" count={3}>
            {["Plan the week", "Call the dentist", "Tidy the desk"].map((t) => (
              <TaskCard key={t} title={t} density="row" estimate={1} onOpen={() => {}} />
            ))}
          </KanbanColumn>
          <KanbanColumn title="Today" count={2} limit={3} width="wide">
            <Cards n={2} />
          </KanbanColumn>
          <KanbanColumn title="Doing" count={1} limit={1} width="wide">
            <Cards n={1} />
          </KanbanColumn>
          <KanbanColumn title="Done" count={5} collapsed onToggle={() => {}} />
        </div>
      </Frame>
    </>
  );
}
