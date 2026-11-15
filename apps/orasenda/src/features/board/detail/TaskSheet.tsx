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
import type { BoardLine } from "../useBoardActions";
import { recordLine } from "./recordLine";
import { useTaskDraft } from "./useTaskDraft";

type Props = {
  task: TaskView;
  columns: readonly ColumnView[];
  update: Parameters<typeof useTaskDraft>[1];
  move(id: string, lane: Lane, index: number): Promise<Outcome>;
  /** The Board's Frog toggle: a Frog that moved says so, with Undo, on the Board's line. */
  toggleFrog(task: TaskView): Promise<boolean>;
  /** The Board's line, shown in the sheet because the sheet covers the board. */
  boardLine: BoardLine;
  /** A save that failed after the sheet closed. */
  onSaveFailed(text: string): void;
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
export function TaskSheet({
  task,
  columns,
  update,
  move,
  toggleFrog,
  boardLine,
  onSaveFailed,
  onClose,
}: Props) {
  const d = useTaskDraft(task, update, onSaveFailed);
  const titleRef = useRef<HTMLInputElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);
  const { draft } = d;
  const close = () => {
    d.leave();
    onClose();
  };

  const checklist = (items: typeof draft.checklist) =>
    d.change({ checklist: items }, { checklist: items });

  const changeLane = async (lane: Lane) => {
    const target = columns.find((c) => c.lane === lane);
    const length = target ? target.tasks.filter((t) => t.id !== task.id).length : 0;
    const outcome = await move(task.id, lane, length);
    if (outcome.status !== "ok") d.setLine({ text: "That didn't save. Try again." });
  };

  const frog = () => {
    // Only setting the Frog is refused in Done; clearing it is allowed.
    if (task.lane === "done" && !task.isFrog) {
      d.setLine({ text: "A finished task can't be the Frog." });
      return;
    }
    if (!d.hasFailed()) d.setLine(null);
    void toggleFrog(task);
  };

  const keepAsIs = async () => {
    if (!(await d.save({ breakdownDismissed: true }))) return;
    setDismissed(true);
    // The notice leaves with the button that has focus: hand focus to the field above it.
    titleRef.current
      ?.closest("[data-slot=dialog-content]")
      ?.querySelector<HTMLElement>("[role=spinbutton]")
      ?.focus();
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
      {/* Notice and Title share one grid cell so an empty (0 high) live region leaves no grid row gap; mb-4 only while it has text. */}
      <div className={`${WIDE} flex flex-col`}>
        <div className={d.line || boardLine ? "mb-4" : undefined}>
          <InlineNotice
            variant="row"
            collapseEmpty
            tone={d.line || boardLine?.tone === "attention" ? "attention" : "rest"}
            actionLabel={
              d.line ? (d.line.retry ? "Try again" : undefined) : boardLine?.action?.label
            }
            actionName={d.line ? "Try again saving" : boardLine?.action?.name}
            onAction={d.line ? d.line.retry : boardLine?.action?.run}
          >
            {d.line?.text ?? boardLine?.text ?? ""}
          </InlineNotice>
        </div>
        <Input
          ref={titleRef}
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
      {breakdown ? (
        <div className={WIDE}>
          <InlineNotice
            actionLabel="Add a checklist"
            onAction={() =>
              checklistRef.current
                ?.querySelector<HTMLInputElement>("[data-slot=checklist] > input[type=text]")
                ?.focus()
            }
            secondaryAction={{
              label: "Keep as is",
              onAction: () => void keepAsIs(),
            }}
          >
            This looks big. Could it be a few smaller tasks?
          </InlineNotice>
        </div>
      ) : null}
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
        <Choice type="checkbox" checked={task.isFrog} onChange={frog}>
          Today's Frog
        </Choice>
      </ChoiceGroup>
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
