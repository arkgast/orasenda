import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";
import { type ImportPreviewItem, ImportPreviewList } from "./import-preview-list.tsx";

const first: ImportPreviewItem[] = [
  { key: "1", title: "Buy stamps", meta: "Due 20 Nov", checked: true },
  { key: "2", title: "Call the bank", why: "Already on the Board, in Today", checked: false },
  { key: "3", title: "Plan the trip", meta: "Work, Travel", checked: true },
];

const many: ImportPreviewItem[] = Array.from({ length: 40 }, (_, i) => ({
  key: String(i),
  title: `Task ${i + 1}`,
  meta: i % 3 === 0 ? "Due 20 Nov" : undefined,
  why: i % 7 === 0 ? "Already on the Board, in Backlog" : undefined,
  checked: i % 4 !== 0,
}));

function Live({
  start,
  summary,
}: {
  start: ImportPreviewItem[];
  summary?: string[];
}): ReactElement {
  const [items, setItems] = useState(start);
  return (
    <ImportPreviewList
      label="Tasks from Reminders"
      items={items}
      summary={summary}
      onToggle={(key) =>
        setItems((cur) => cur.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)))
      }
      onSetAll={(checked) => setItems((cur) => cur.map((i) => ({ ...i, checked })))}
    />
  );
}

function Sheet({ onClose }: { onClose: () => void }): ReactElement {
  const [items, setItems] = useState(many);
  const count = items.filter((i) => i.checked).length;
  return (
    <Dialog
      size="sheet"
      title="Import tasks from Reminders"
      confirmLabel={`Import ${count} tasks`}
      confirmDisabledReason={count === 0 ? "Select at least one task to import." : undefined}
      cancelLabel="Cancel"
      onCancel={onClose}
      onConfirm={onClose}
    >
      <div className="@sheet-stack:col-span-2">
        <ImportPreviewList
          label="Tasks from Reminders"
          items={items}
          summary={["Showing 40 of 40 tasks."]}
          onToggle={(key) =>
            setItems((cur) => cur.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)))
          }
          onSetAll={(checked) => setItems((cur) => cur.map((i) => ({ ...i, checked })))}
        />
      </div>
    </Dialog>
  );
}

export function ImportPreviewListSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Frame state="import-preview-list-default" width={460} height={360}>
        <Live start={first} summary={["Showing 3 of 3 tasks."]} />
      </Frame>
      <Frame state="import-preview-list-none-selected" width={460} height={320}>
        <Live start={first.map((i) => ({ ...i, checked: false }))} />
      </Frame>
      <Frame state="import-preview-list-sheet" width={300} height={72}>
        <Button onClick={() => setOpen(true)}>Open the import sheet</Button>
      </Frame>
      {open ? <Sheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
