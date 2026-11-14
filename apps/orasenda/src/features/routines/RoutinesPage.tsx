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
import { type ReactElement, useState } from "react";
import { ActionMenu, type MoreAction } from "./ActionMenu";
import { HabitList } from "./HabitList";
import { RoutineList } from "./RoutineList";
import { TemplateDialog } from "./TemplateDialog";
import { type Line, type RoutinesView, useRoutines } from "./useRoutines";
import "./routines.css";

const LINES: Record<Exclude<Line, null>, string> = {
  writeFailed: "That change couldn't be saved. Your data is safe; try again in a moment.",
  readFailed: "Routines can't be read right now. Your data is safe; try again in a moment.",
  makeRoutineSoon: "Making your own routine comes in the next update.",
  makeHabitSoon: "Making a habit comes in the next update.",
  editRoutineSoon: "Editing routines comes in the next update.",
  editHabitSoon: "Editing habits comes in the next update.",
  removeRoutineSoon: "Removing routines comes in the next update.",
  removeHabitSoon: "Removing habits comes in the next update.",
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
  const { routines, line, setLine, check, addTemplate, move, retry } = useRoutines();
  const [templates, setTemplates] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const view = routines.status === "ok" ? routines.view : null;
  const empty = view !== null && view.routines.length === 0 && view.habits.length === 0;

  const more = (kind: "Routine" | "Habit") => (id: string, index: number, action: MoreAction) => {
    if (action === "up" || action === "down") {
      return move(kind === "Routine" ? "routine" : "habit", id, index + (action === "up" ? -1 : 1));
    }
    setLine(`${action}${kind}Soon`);
  };

  const onAdd = (id: string) => {
    if (id === "template") return setTemplates(true);
    setLine(id === "habit" ? "makeHabitSoon" : "makeRoutineSoon");
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
  ) : (
    <InlineNotice variant="row" tone={line === "writeFailed" ? "attention" : "neutral"}>
      {line ? LINES[line] : ""}
    </InlineNotice>
  );

  const primary = empty ? (
    <Button variant="primary" onClick={() => setTemplates(true)}>
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
              onAction={() => setLine("makeRoutineSoon")}
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
                onMore={more("Routine")}
              />
              {view.habits.length > 0 ? (
                <HabitList
                  habits={view.habits}
                  legendFor={legendFor(view, expanded)}
                  onCheck={check}
                  onMore={more("Habit")}
                />
              ) : null}
            </div>
          ) : null}
        </ScrollRegion>
      </PageFrame>
      {templates ? (
        <TemplateDialog onAdd={addTemplate} onClose={() => setTemplates(false)} />
      ) : null}
    </div>
  );
}
