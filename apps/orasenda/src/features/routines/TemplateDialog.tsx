import { Choice, ChoiceGroup, Dialog, InlineNotice, WellnessNote } from "@orasenda/ui";
import {
  commands,
  type RoutinesError,
  type TemplateId,
  type TemplateView_Serialize,
} from "@shared/ipc/bindings";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import type { Outcome } from "./useRoutines";

type Templates =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; templates: TemplateView_Serialize[] };

const REFUSED: Partial<Record<RoutinesError | "unreachable", string>> = {
  full: "You have 30 routines, the most Orasenda keeps. Remove one to add another.",
  running: "A routine is running. Add this one when it ends.",
};
const ADD_FAILED = "Couldn't add the routine. Your data is safe; try again in a moment.";
const READ_FAILED = "Templates can't be read right now. Try again in a moment.";

/** The five templates as `routine_templates` answers them. A failure is said, never an empty list. */
function useTemplates() {
  const [templates, setTemplates] = useState<Templates>({ status: "loading" });
  const [asks, setAsks] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asks` is the retry trigger
  useEffect(() => {
    let cancelled = false;
    setTemplates({ status: "loading" });
    const failed = (error: unknown) => {
      console.error("routine_templates failed", error);
      if (!cancelled) setTemplates({ status: "error" });
    };
    commands.routineTemplates().then((result) => {
      if (result.status === "error") return failed(result.error);
      if (!cancelled) setTemplates({ status: "ok", templates: result.data });
    }, failed);
    return () => {
      cancelled = true;
    };
  }, [asks]);
  const retry = useCallback(() => setAsks((n) => n + 1), []);
  return { templates, retry };
}

type Props = {
  onAdd(template: TemplateId): Promise<Outcome>;
  onClose(): void;
};

/** *Start from a template*: the five templates as choices, the chosen one's steps and its note. */
export function TemplateDialog({ onAdd, onClose }: Props): ReactElement {
  const { templates, retry } = useTemplates();
  const [chosen, setChosen] = useState<TemplateId | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = templates.status === "ok" ? templates.templates : [];
  const current = list.find((t) => t.id === chosen) ?? list[0];

  const add = () => {
    if (templates.status === "error") return retry();
    if (!current || adding) return;
    setAdding(true);
    setError(null);
    onAdd(current.id).then((outcome) => {
      setAdding(false);
      if (outcome.status === "ok") return onClose();
      setError(REFUSED[outcome.error] ?? ADD_FAILED);
    });
  };

  return (
    <Dialog
      title="Start from a template"
      description="Each one becomes your own routine, to change as you like."
      confirmLabel={templates.status === "error" ? "Try again" : "Add routine"}
      loading={templates.status === "loading" || adding}
      onConfirm={add}
      onCancel={onClose}
    >
      {templates.status === "error" ? <p className="app-routines-muted">{READ_FAILED}</p> : null}
      {current ? (
        <div className="app-routines-templates">
          <ChoiceGroup legend="Template">
            {list.map((template) => (
              <Choice
                key={template.id}
                name="template"
                value={template.id}
                long
                description={[template.summary, template.time].filter(Boolean).join(" · ")}
                checked={template.id === current.id}
                onChange={() => setChosen(template.id)}
              >
                {template.name}
              </Choice>
            ))}
          </ChoiceGroup>
          <ol className="app-routines-template-steps" aria-label={`Steps in ${current.name}`}>
            {current.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <WellnessNote as="p">{current.note}</WellnessNote>
        </div>
      ) : null}
      {error ? (
        <InlineNotice variant="row" tone="attention">
          {error}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}
