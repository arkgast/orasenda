import { type ReactElement, useRef, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Checklist, type ChecklistItem } from "./checklist";

function Live(props: { initial: ChecklistItem[]; max?: number }): ReactElement {
  const [items, setItems] = useState(props.initial);
  const counter = useRef(0);
  return (
    <Checklist
      label="Checklist"
      items={items}
      max={props.max}
      onToggle={(id) => setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))}
      onAdd={(text) => setItems([...items, { id: `n${counter.current++}`, text, done: false }])}
      onRemove={(id) => setItems(items.filter((i) => i.id !== id))}
      onRename={(id, text) => setItems(items.map((i) => (i.id === id ? { ...i, text } : i)))}
    />
  );
}

const some: ChecklistItem[] = [
  { id: "a", text: "Outline the argument", done: true },
  { id: "b", text: "Draft the first section", done: false },
  { id: "c", text: "Ask for a read-through", done: false },
];

export function ChecklistSpecimen(): ReactElement {
  return (
    <>
      <Frame state="checklist-empty" width={400} height={140}>
        <Live initial={[]} />
      </Frame>
      <Frame state="checklist-items" width={400} height={300}>
        <Live initial={some} />
      </Frame>
      <Frame state="checklist-long-text" width={360} height={240}>
        <Live
          initial={[
            {
              id: "l",
              text: "Write to the whole committee about the schedule change and the new room",
              done: false,
            },
          ]}
        />
      </Frame>
      <Frame state="checklist-at-max" width={400} height={240}>
        <Live initial={some.slice(0, 2)} max={2} />
      </Frame>
    </>
  );
}
