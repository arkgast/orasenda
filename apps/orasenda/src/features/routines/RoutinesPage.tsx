import { PagesButton } from "@domain/navigation/PagesButton";
import {
  Button,
  EmptyState,
  InlineNotice,
  type NavPage,
  PageFrame,
  ScrollRegion,
} from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { ActionMenu, type MoreAction, moreId } from "./ActionMenu";
import { type Editing, Editor, findHabit } from "./Editors";
import { byId, useFocusAfter } from "./focusAfter";
import { HabitList } from "./HabitList";
import { RoutineList } from "./RoutineList";
import { TemplateDialog } from "./TemplateDialog";
import { type Line, type Notice, type RoutinesView, useRoutines } from "./useRoutines";
import { useUndoRemove } from "./useUndoRemove";
import "./routines.css";

const LINES: Record<Exclude<Line, Notice | null>, string> = {
  writeFailed: "That change couldn't be saved. Your data is safe; try again in a moment.",
  readFailed: "Routines can't be read right now. Your data is safe; try again in a moment.",
};

/**
 * The routine whose Start is the page's one primary action. Rust gives no "due" field and the
 * webview never reads the clock (ADR-011), so: the one in progress today, else the first one in
 * the person's order not started today. Null when every routine is done today.
 */
export function primaryStart(view: RoutinesView): string | null {
  const open = view.routines.find((r) => r.today === "inProgress");
  return (open ?? view.routines.find((r) => r.today === "notStarted"))?.id ?? null;
}

/** The habit whose grid shows the page's one legend: the first grid on the page. */
function legendFor(view: RoutinesView, expanded: ReadonlySet<string>): string | null {
  const routine = view.routines.find((r) => expanded.has(r.id) && r.habits.length > 0);
  return routine?.habits[0]?.id ?? view.habits[0]?.id ?? null;
}

type Props = {
  onNavigate(page: NavPage): void;
  /** Starts a routine's run. The run view (R8) wires it; until then no Start shows. */
  onStart?: (routineId: string) => void;
};

/** The Routines page: the routines as cards, the standalone habits, and Add. */
export function RoutinesPage({ onNavigate, onStart }: Props): ReactElement {
  const { compact } = useWindowLayout();
  const { routines, line, setLine, check, addTemplate, move, write, retry } = useRoutines();
  const focus = useFocusAfter();
  const removal = useUndoRemove({ write, setLine, focus });
  const [templates, setTemplates] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const view = routines.status === "ok" ? routines.view : null;
  const empty = view !== null && view.routines.length === 0 && view.habits.length === 0;

  // Opening an editor is the next action: it clears the status row, Undo included.
  const edit = (next: Editing) => {
    setLine(null);
    setEditing(next);
  };

  const more = (kind: "routine" | "habit") => (id: string, index: number, action: MoreAction) => {
    if (!view) return;
    if (action === "up" || action === "down") {
      // Focus stays on the moved item's More once the new order is drawn.
      return move(kind, id, index + (action === "up" ? -1 : 1), () => focus(byId(moreId(id))));
    }
    if (action === "step") return edit({ kind: "habit", habit: null, routineId: id, asStep: true });
    const routine = kind === "routine" ? view.routines.find((r) => r.id === id) : undefined;
    const habit = kind === "habit" ? findHabit(view, id) : undefined;
    if (action === "edit") {
      if (routine) edit({ kind: "routine", routine });
      if (habit) edit({ kind: "habit", habit, routineId: habit.routineId, asStep: false });
      return;
    }
    const item = routine ?? habit;
    if (!item) return;
    const inRoutine = habit?.routineId ? view.routines.find((r) => r.id === habit.routineId) : null;
    removal.remove({ kind, id, name: item.name, routine: inRoutine });
  };

  // Opening the templates is the next action too.
  const openTemplates = () => {
    setLine(null);
    setTemplates(true);
  };

  // A new item's More takes focus once its editor has closed. The dialog hands focus back to
  // its opener (Add) on a zero-delay timer as it unmounts, so this waits for that and then moves.
  const created = useRef<string | null>(null);
  useEffect(() => {
    const id = created.current;
    if (editing || !id) return;
    created.current = null;
    const timer = setTimeout(() => document.getElementById(moreId(id))?.focus(), 0);
    return () => clearTimeout(timer);
  }, [editing]);

  const onAdd = (id: string) => {
    if (id === "template") return openTemplates();
    if (id === "habit") return edit({ kind: "habit", habit: null, routineId: null, asStep: false });
    edit({ kind: "routine", routine: null });
  };

  const failed = routines.status === "error" || line === "readFailed";
  const status = failed ? (
    <InlineNotice
      variant="row"
      tone="attention"
      actionLabel="Try again"
      actionName="Try again reading your routines"
      onAction={retry}
    >
      {LINES.readFailed}
    </InlineNotice>
  ) : typeof line === "object" && line !== null ? (
    <InlineNotice
      variant="row"
      tone={line.tone}
      actionLabel={line.action?.label}
      actionName={line.action?.name}
      onAction={line.action?.run}
    >
      {line.text}
    </InlineNotice>
  ) : (
    <InlineNotice variant="row" tone={line === "writeFailed" ? "attention" : "neutral"}>
      {line ? LINES[line] : ""}
    </InlineNotice>
  );

  const primary = empty ? (
    <Button variant="primary" onClick={openTemplates}>
      Start from a template
    </Button>
  ) : view ? (
    <ActionMenu
      label="Add"
      heading="Add"
      items={[
        { id: "routine", label: "New routine", kind: "link" },
        { id: "template", label: "From a template…", kind: "link" },
        { id: "habit", label: "New habit", kind: "link" },
      ]}
      onSelect={onAdd}
    />
  ) : undefined;

  return (
    <div className="app-routines-page">
      <PageFrame
        title="Routines"
        compactPicker={
          compact ? <PagesButton current="routines" onNavigate={onNavigate} /> : undefined
        }
        primary={primary}
        status={status}
      >
        <ScrollRegion label="Routines">
          {empty ? (
            <EmptyState
              title="No routines yet."
              message="Routines are small steps you take at the same time each day."
              actionLabel="Make your own"
              onAction={() => edit({ kind: "routine", routine: null })}
            />
          ) : view ? (
            <div className="app-routines-body">
              <RoutineList
                routines={view.routines}
                expanded={expanded}
                onToggleRecord={(id) =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (!next.delete(id)) next.add(id);
                    return next;
                  })
                }
                legendFor={legendFor(view, expanded)}
                onStart={onStart}
                primaryStart={onStart ? primaryStart(view) : null}
                onMore={more("routine")}
                onStepMore={more("habit")}
              />
              {view.habits.length > 0 ? (
                <HabitList
                  habits={view.habits}
                  legendFor={legendFor(view, expanded)}
                  onCheck={check}
                  onMore={more("habit")}
                />
              ) : null}
            </div>
          ) : null}
        </ScrollRegion>
      </PageFrame>
      {editing && view ? (
        <Editor
          editing={editing}
          view={view}
          write={write}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            // An edited item's More opened the editor and gets focus back from the dialog.
            const isNew = editing.kind === "routine" ? !editing.routine : !editing.habit;
            if (isNew) created.current = id;
          }}
        />
      ) : null}
      {templates ? (
        <TemplateDialog onAdd={addTemplate} onClose={() => setTemplates(false)} />
      ) : null}
    </div>
  );
}
