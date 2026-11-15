import { useSurfaceTimer } from "@domain/timer/useSurfaceTimer";
import {
  Button,
  Dialog,
  EmptyState,
  ImportPreviewList,
  ImportSourcePicker,
  InlineNotice,
} from "@orasenda/ui";
import type { ImportDone, ImportSourceKind } from "@shared/ipc/bindings";
import { useEffect, useRef } from "react";
import { NO_SELECTION, SOURCE_COPY, tasks } from "./copy";
import { type Problem, useImport } from "./useImport";

type Props = {
  onImported(done: ImportDone): void;
  onClose(): void;
};

/** The line for a failed read or write, with the way on that fits it. */
function ProblemLine({
  problem,
  onSettings,
  onRetry,
}: {
  problem: Problem;
  onSettings(source: ImportSourceKind): void;
  onRetry(): void;
}) {
  const source = problem.source;
  return (
    <InlineNotice
      actionLabel={problem.denied && source ? "Open System Settings" : undefined}
      onAction={problem.denied && source ? () => onSettings(source) : undefined}
      secondaryAction={
        problem.kind === "write" || (problem.denied && source === "things")
          ? { label: "Try again", onAction: onRetry }
          : undefined
      }
    >
      {problem.text}
    </InlineNotice>
  );
}

/**
 * The Board's import sheet (spec "App"): sources, then the preview. It opens only when asked, reads
 * only when a source is picked and writes only on *Import N tasks*.
 */
export function ImportSheet({ onImported, onClose }: Props) {
  const { view } = useSurfaceTimer();
  const busy = (view?.state ?? "idle") !== "idle";
  const api = useImport({ active: busy, onImported, onClose });
  const { problem, preview, step, chosen } = api;
  const pickerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);

  // The dialog focuses the first source on open; the preview moves focus to its list.
  useEffect(() => {
    if (step === "preview") listRef.current?.focus();
  }, [step]);

  // Reminders asks the OS only when access was never asked, so coming back from System Settings
  // reads again; nothing about access is stored.
  const waiting = problem?.denied === true && problem.source === "reminders";
  const { read } = api;
  useEffect(() => {
    if (!waiting) return;
    const onFocus = () => void read("reminders", true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [waiting, read]);

  const retry = () => {
    if (problem?.kind === "write") void api.commit();
    else if (problem?.source) void api.read(problem.source);
  };

  const line = problem ? (
    <ProblemLine problem={problem} onSettings={api.openSettings} onRetry={retry} />
  ) : null;

  if (step === "preview" && preview) {
    const count = chosen.size;
    return (
      <Dialog
        size="sheet"
        open={api.ready}
        title={`Import tasks · ${preview.sourceName}`}
        confirmLabel={api.importing ? "Importing…" : `Import ${tasks(count)}`}
        confirmDisabledReason={count === 0 ? NO_SELECTION : undefined}
        loading={api.importing}
        onConfirm={() => void api.commit()}
        cancelLabel="Close"
        onCancel={api.close}
        initialFocusRef={listRef}
      >
        {line ? (
          <div className="@sheet-stack:col-span-2">
            {line}
            {problem?.kind === "stale" ? (
              <Button onClick={api.chooseAnother}>Choose another source</Button>
            ) : null}
          </div>
        ) : null}
        <div className="@sheet-stack:col-span-2">
          <ImportPreviewList
            ref={listRef}
            label={`Tasks from ${preview.sourceName}`}
            items={preview.items.map((i) => ({
              key: String(i.key),
              title: i.title,
              meta: i.meta || undefined,
              why: i.why ?? undefined,
              checked: chosen.has(i.key),
            }))}
            summary={[...(preview.line ? [preview.line] : []), ...preview.summary]}
            onToggle={(key) => api.toggle(Number(key))}
            onSetAll={api.setAll}
          />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      size="sheet"
      open={api.ready}
      title="Import tasks"
      cancelLabel="Close"
      onCancel={api.close}
      initialFocusRef={pickerRef}
    >
      {step === "empty" && preview ? (
        <div className="@sheet-stack:col-span-2">
          <EmptyState
            title={`No open tasks in ${preview.sourceName}.`}
            actionLabel="Choose another source"
            onAction={api.chooseAnother}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 @sheet-stack:col-span-2">
          {line}
          <ImportSourcePicker
            ref={pickerRef}
            reading={api.reading ?? undefined}
            sources={api.sources.map((s) => ({
              kind: s.kind,
              name: SOURCE_COPY[s.kind].name,
              description: SOURCE_COPY[s.kind].description,
              disabledReason: s.available ? undefined : (s.reason ?? "Not available right now."),
            }))}
            onPick={(kind) => void api.read(kind as ImportSourceKind)}
          />
        </div>
      )}
    </Dialog>
  );
}
