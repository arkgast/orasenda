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

const DROP_CARDS = [
  <TaskCard key="a" title="Outline" moving estimate={2} onOpen={() => {}} />,
  <TaskCard key="b" title="Draft" estimate={2} onOpen={() => {}} />,
  <TaskCard key="c" title="Edit" estimate={1} onOpen={() => {}} />,
];

export function KanbanColumnSpecimen(): ReactElement {
  return (
    <>
      <Frame state="kanban-column-under-limit-280" width={280} height={420}>
        <div className="flex h-full">
          <KanbanColumn
            title="Today"
            count={2}
            limit={3}
            footer={<Button variant="quiet">Add task</Button>}
          >
            <Cards n={2} />
          </KanbanColumn>
        </div>
      </Frame>
      <Frame state="kanban-column-header-min-width-200" width={200} height={300}>
        <div className="flex h-full">
          <KanbanColumn
            title="Today"
            count={4}
            limit={3}
            onToggle={() => {}}
            onAdd={() => {}}
            onEdit={() => {}}
          >
            <Cards n={2} />
          </KanbanColumn>
        </div>
      </Frame>
      <Frame state="kanban-column-header-long-name-200" width={200} height={200}>
        <KanbanColumn
          title="Waiting on others"
          count={1}
          onToggle={() => {}}
          onAdd={() => {}}
          onEdit={() => {}}
        />
      </Frame>
      <Frame state="kanban-column-editor-slot-280" width={280} height={300}>
        <KanbanColumn
          title="Waiting"
          count={1}
          editor={<p className="m-0 text-body-sm text-ink">Editor goes here.</p>}
        >
          <Cards n={1} />
        </KanbanColumn>
      </Frame>
      <Frame state="kanban-column-at-limit-280" width={280} height={300}>
        <KanbanColumn title="Doing" count={1} limit={1}>
          <Cards n={1} />
        </KanbanColumn>
      </Frame>
      <Frame state="kanban-column-over-limit-280" width={280} height={460}>
        <div className="flex h-full">
          <KanbanColumn title="Today" count={4} limit={3}>
            <Cards n={4} />
          </KanbanColumn>
        </div>
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
      <Frame state="kanban-column-drop-slot-280" width={280} height={460}>
        <div className="flex h-full">
          <KanbanColumn
            title="Today"
            count={3}
            limit={5}
            drop={{ index: 2, label: "Moving Outline here" }}
          >
            {DROP_CARDS}
          </KanbanColumn>
        </div>
      </Frame>
      <Frame state="kanban-column-drop-empty-280" width={280} height={160}>
        <KanbanColumn title="Doing" count={0} drop={{ index: 0, label: "Moving Outline here" }} />
      </Frame>
      <Frame state="kanban-board-strip-move-here-300" width={300} height={200}>
        <div className="flex h-full gap-2">
          <KanbanColumn title="Today" count={4} limit={5} collapsed onToggle={() => {}} />
          <KanbanColumn
            title="Done"
            count={5}
            collapsed
            onToggle={() => {}}
            drop={{ index: 0, label: "Moving Outline here" }}
          />
        </div>
      </Frame>
      <Frame state="task-card-moving-card-280" width={280} height={220}>
        <TaskCard title="Outline" moving estimate={2} done={1} onOpen={() => {}} />
      </Frame>
      <Frame state="task-card-moving-row-280" width={280} height={100}>
        <TaskCard title="Outline" density="row" moving estimate={2} onOpen={() => {}} />
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
