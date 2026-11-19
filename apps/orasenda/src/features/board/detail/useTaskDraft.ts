import type {
  ChecklistItemView,
  TaskKind,
  TaskPatchView_Deserialize,
  TaskPriority,
  TaskView,
} from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { boardWords } from "../boardWords";
import type { Outcome } from "../useBoard";

/** How long a text field waits after the last keystroke before it saves. */
export const SAVE_MS = 800;

type Patch = TaskPatchView_Deserialize;
type Key = "title" | "notes";

export type Draft = {
  title: string;
  notes: string;
  tags: string[];
  kind: TaskKind;
  /** 0 is "No estimate". */
  estimate: number;
  due: string;
  priority: TaskPriority | "";
  checklist: ChecklistItemView[];
};

export type SaveLine = { text: string; retry?: () => void } | null;

const fromTask = (task: TaskView): Draft => ({
  title: task.title,
  notes: task.notes,
  tags: task.tags,
  kind: task.kind,
  estimate: task.estimate ?? 0,
  due: task.due ?? "",
  priority: task.priority ?? "",
  checklist: task.checklist,
});

/**
 * The sheet's fields as the person has them, and how they reach Rust. The draft is the truth for the
 * fields it holds, so a failed save never changes what is typed; discrete fields save at once, text
 * fields on blur or after a pause, and the board's own events only update what the draft doesn't hold.
 */
export function useTaskDraft(
  task: TaskView,
  update: (id: string, patch: Patch) => Promise<Outcome>,
  /** Told when a save fails after the sheet is gone, so the Board can say so. */
  onSaveFailed?: (text: string) => void,
) {
  const [draft, setDraft] = useState<Draft>(() => fromTask(task));
  const [titleError, setTitleError] = useState("");
  const [line, setLine] = useState<SaveLine>(null);
  const live = useRef({ task, draft, update, onSaveFailed });
  live.current = { task, draft, update, onSaveFailed };
  // Patches that did not save yet: a later success clears the line only when none are left.
  const failed = useRef<Patch>({});
  const gone = useRef(false);
  const timers = useRef<Partial<Record<Key, ReturnType<typeof setTimeout>>>>({});

  const save = useCallback(async (patch: Patch): Promise<boolean> => {
    const { task: current, update: write } = live.current;
    const outcome = await write(current.id, patch);
    if (outcome.status === "ok") {
      for (const key of Object.keys(patch)) delete failed.current[key as keyof Patch];
      if (Object.keys(failed.current).length === 0) setLine(null);
      return true;
    }
    failed.current = { ...failed.current, ...patch };
    const text = boardWords(outcome.error);
    if (gone.current) live.current.onSaveFailed?.(text);
    else
      setLine({
        text,
        retry: outcome.error === "notFound" ? undefined : () => void save({ ...failed.current }),
      });
    return false;
  }, []);

  const change = useCallback(
    (next: Partial<Draft>, patch?: Patch) => {
      setDraft((d) => ({ ...d, ...next }));
      if (patch) void save(patch);
    },
    [save],
  );

  const flush = useCallback(
    (key: Key) => {
      clearTimeout(timers.current[key]);
      delete timers.current[key];
      const { task: current, draft: now } = live.current;
      if (key === "title") {
        const title = now.title.trim();
        if (!title) {
          setTitleError(`A task needs a title. Still using ${current.title}.`);
          setLine({ text: "The title wasn't saved." });
          return;
        }
        setTitleError("");
        if (title !== current.title) void save({ title });
      } else if (now.notes !== current.notes) void save({ notes: now.notes });
    },
    [save],
  );

  const text = useCallback(
    (key: Key, value: string) => {
      setDraft((d) => ({ ...d, [key]: value }));
      if (key === "title") setTitleError("");
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => flush(key), SAVE_MS);
    },
    [flush],
  );

  const flushAll = useCallback(() => {
    for (const key of ["title", "notes"] as const) if (timers.current[key]) flush(key);
  }, [flush]);

  /** The sheet is closing: save what is pending, and report any failure to the Board instead. */
  const leave = useCallback(() => {
    gone.current = true;
    flushAll();
  }, [flushAll]);

  // A pending pause does not outlive the sheet: whatever was typed is saved on the way out.
  useEffect(() => {
    gone.current = false;
    return leave;
  }, [leave]);

  const hasFailed = useCallback(() => Object.keys(failed.current).length > 0, []);

  return { draft, titleError, line, setLine, hasFailed, save, change, text, flush, leave };
}
