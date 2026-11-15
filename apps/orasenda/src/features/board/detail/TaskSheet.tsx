import {
  Checklist,
  Choice,
  ChoiceGroup,
  Dialog,
  InlineNotice,
  Input,
  Select,
  Stepper,
  TagField,
  TextArea,
} from "@orasenda/ui";
import type { ColumnView, Lane, TaskPriority, TaskView } from "@shared/ipc/bindings";
import { useRef, useState } from "react";
import type { Outcome } from "../useBoard";
import { recordLine } from "./recordLine";
import { useTaskDraft } from "./useTaskDraft";

type Props = {
  task: TaskView;
  columns: readonly ColumnView[];
  update: Parameters<typeof useTaskDraft>[1];
  move(id: string, lane: Lane, index: number): Promise<Outcome>;
  setFrog(id: string, on: boolean): Promise<Outcome<string | null>>;
  onClose(): void;
};

const PRIORITIES = [
  { value: "", label: "None" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

const WIDE = "@sheet-stack:col-span-2";
const sessions = (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`;

/** The task detail (owner pick 2B): a sheet over the board whose fields save as they change. */
export function TaskSheet({ task, columns, update, move, setFrog, onClose }: Props) {
  const d = useTaskDraft(task, update);
  // The title field is inside the Input component: the dialog gets a ref that finds it.
  const titleBox = useRef<HTMLDivElement>(null);
  const titleRef = {
    get current() {
      return titleBox.current?.querySelector<HTMLInputElement>("input") ?? null;
    },
  };
  const [dismissed, setDismissed] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);
  const { draft } = d;
  const close = () => {
    d.flushAll();
    onClose();
  };

  const checklist = (items: typeof draft.checklist) =>
    d.change({ checklist: items }, { checklist: items });

  const changeLane = async (lane: Lane) => {
    const target = columns.find((c) => c.lane === lane);
    const length = target ? target.tasks.filter((t) => t.id !== task.id).length : 0;
    const outcome = await move(task.id, lane, length);
    if (outcome.status !== "ok") d.setLine({ text: "That didn't save. Try again." });
    else d.setLine(null);
  };

  const toggleFrog = async () => {
    if (task.lane === "done") {
      d.setLine({ text: "A finished task can't be the Frog." });
      return;
    }
    const outcome = await setFrog(task.id, !task.isFrog);
    if (outcome.status === "ok") d.setLine(null);
    else
      d.setLine({
        text:
          outcome.error === "doneCannotBeFrog"
            ? "A finished task can't be the Frog."
            : "That didn't save. Try again.",
      });
  };

  const breakdown = draft.estimate > 4 && !task.breakdownDismissed && !dismissed;

  return (
    <Dialog
      size="sheet"
      title={task.title}
      confirmLabel="Done"
      cancelLabel="Close"
      onConfirm={close}
      onCancel={close}
      initialFocusRef={titleRef}
    >
      <div className={WIDE}>
        <InlineNotice
          variant="row"
          tone={d.line ? "attention" : "rest"}
          actionLabel={d.line?.retry ? "Try again" : undefined}
          actionName="Try again saving"
          onAction={d.line?.retry}
        >
          {d.line?.text ?? ""}
        </InlineNotice>
      </div>
      <div ref={titleBox} className={WIDE}>
        <Input
          label="Title"
          maxLength={200}
          value={draft.title}
          error={d.titleError || undefined}
          onChange={(e) => d.text("title", e.target.value)}
          onBlur={() => d.flush("title")}
        />
      </div>
      <ChoiceGroup legend="Type">
        {(["deep", "shallow"] as const).map((kind) => (
          <Choice
            key={kind}
            name="kind"
            value={kind}
            checked={draft.kind === kind}
            onChange={() => d.change({ kind }, { kind })}
          >
            {kind === "deep" ? "Deep" : "Shallow"}
          </Choice>
        ))}
      </ChoiceGroup>
      <Stepper
        label="Estimate"
        value={draft.estimate}
        min={0}
        max={16}
        zeroLabel="No estimate"
        valueText={sessions}
        onChange={(estimate) =>
          d.change({ estimate }, { estimate: estimate === 0 ? null : estimate })
        }
      />
      <Input
        label="Due"
        type="date"
        value={draft.due}
        onChange={(e) => d.change({ due: e.target.value }, { due: e.target.value || null })}
      />
      <Select
        label="Priority"
        value={draft.priority}
        options={PRIORITIES}
        onChange={(e) => {
          const priority = e.target.value as TaskPriority | "";
          d.change({ priority }, { priority: priority || null });
        }}
      />
      <Select
        label="Column"
        value={task.lane}
        options={columns.map((c) => ({ value: c.lane, label: c.name }))}
        onChange={(e) => void changeLane(e.target.value as Lane)}
      />
      <ChoiceGroup legend="Frog">
        <Choice type="checkbox" checked={task.isFrog} onChange={() => void toggleFrog()}>
          Today's Frog
        </Choice>
      </ChoiceGroup>
      {breakdown ? (
        <div className={WIDE}>
          <InlineNotice
            actionLabel="Add a checklist"
            onAction={() =>
              checklistRef.current
                ?.querySelector<HTMLInputElement>("input[type=text]:last-of-type")
                ?.focus()
            }
            secondaryAction={{
              label: "Keep as is",
              onAction: () =>
                void d.save({ breakdownDismissed: true }).then((ok) => ok && setDismissed(true)),
            }}
          >
            This looks big. Could it be a few smaller tasks?
          </InlineNotice>
        </div>
      ) : null}
      <div className={WIDE}>
        <TagField
          label="Tags"
          tags={draft.tags}
          onChange={(tags) => d.change({ tags }, { tags })}
        />
      </div>
      <div ref={checklistRef} className={WIDE}>
        <Checklist
          label="Checklist"
          items={draft.checklist}
          onToggle={(id) =>
            checklist(draft.checklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
          }
          onAdd={(text) =>
            checklist([...draft.checklist, { id: crypto.randomUUID(), text, done: false }])
          }
          onRemove={(id) => checklist(draft.checklist.filter((i) => i.id !== id))}
          onRename={(id, text) =>
            checklist(draft.checklist.map((i) => (i.id === id ? { ...i, text } : i)))
          }
        />
      </div>
      <div className={WIDE}>
        <TextArea
          label="Notes"
          maxLength={10000}
          value={draft.notes}
          onChange={(e) => d.text("notes", e.target.value)}
          onBlur={() => d.flush("notes")}
        />
      </div>
      <p className={`m-0 text-body-sm text-ink-muted ${WIDE}`}>{recordLine(task)}</p>
    </Dialog>
  );
}
