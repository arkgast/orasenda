import {
  commands,
  type PriorityPick,
  type ReviewError,
  type WeeklyDraft_Deserialize,
  type WeeklyView_Serialize,
} from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";

export const STEP_TITLES = ["Look back", "One improvement", "Priorities", "Week planned."];

/** Rust's limit on a typed priority (a task title), in characters. */
const MAX_TITLE = 200;
const MAX_IMPROVEMENT = 200;
const MAX_NOTES = 2_000;

/** ReviewError carries no text, so these are Rust's words for the limits, kept here (and pinned). */
export const TOO_LONG_PRIORITY = "Keep a priority to 200 characters.";
const TOO_LONG_IMPROVEMENT = "Keep your improvement to 200 characters.";
const TOO_LONG_NOTES = "Keep your notes to 2,000 characters.";

const NOT_FOUND = "One of those tasks is no longer on your board. Choose another, or leave it out.";
const SAVE_FAILED = "Orasenda can't save your weekly review right now.";
const SAVE_LINES: Partial<Record<ReviewError, string>> = {
  period: "This review is for an earlier week. Open Review again to see this week.",
  notFound: NOT_FOUND,
};

/** A priority in the draft: a task on the board, or a title typed here that Rust adds once. */
export type Pick = { task: string; title: string } | { newTitle: string };

export type Draft = { improvement: string; notes: string; picks: Pick[] };

export type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; view: WeeklyView_Serialize };

const draftOf = (view: WeeklyView_Serialize): Draft => ({
  improvement: view.answers.improvement ?? "",
  notes: view.answers.notes ?? "",
  picks: view.answers.priorities.map((p) => ({ task: p.taskId, title: p.title })),
});

/** The whole draft, as Rust takes it: empty text is no answer; Rust trims the rest. */
const draftToSend = (draft: Draft): WeeklyDraft_Deserialize => ({
  improvement: draft.improvement || null,
  notes: draft.notes || null,
  priorities: draft.picks.map(
    (pick): PriorityPick => ("task" in pick ? { task: pick.task } : { newTitle: pick.newTitle }),
  ),
});

const length = (text: string) => [...text.trim()].length;

/** Whether a typed priority is over Rust's limit, for the picker that caused a TooLong. */
export const isTooLong = (pick: Pick): boolean =>
  "newTitle" in pick && length(pick.newTitle) > MAX_TITLE;

/** What a TooLong answer means for this draft: a line at the top, or a flag for the pickers. */
function tooLong(draft: Draft): { line: string | null; priority: boolean } {
  if (length(draft.improvement) > MAX_IMPROVEMENT)
    return { line: TOO_LONG_IMPROVEMENT, priority: false };
  if (length(draft.notes) > MAX_NOTES) return { line: TOO_LONG_NOTES, priority: false };
  return { line: null, priority: true };
}

/**
 * The weekly review's state: the view from `weekly_get`, the step, and the draft. A save or a
 * completion replaces the draft with the view Rust returns, whose priorities carry the ids of
 * any typed title, so Back and Continue again never create a second task. One call at a time.
 */
export function useWeekly() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ improvement: "", notes: "", picks: [] });
  const [line, setLine] = useState<string | null>(null);
  const [priorityTooLong, setPriorityTooLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const live = useRef(true);

  const read = useCallback(() => {
    setLoad({ status: "loading" });
    const failed = (error: unknown) => {
      console.error("weekly_get failed", error);
      if (live.current) setLoad({ status: "error" });
    };
    commands.weeklyGet().then((result) => {
      if (!live.current) return;
      if (result.status === "error") return failed(result.error);
      setDraft(draftOf(result.data));
      setLoad({ status: "ok", view: result.data });
    }, failed);
  }, []);

  useEffect(() => {
    live.current = true;
    read();
    return () => {
      live.current = false;
    };
  }, [read]);

  /** Saves or completes `sent` for the week; on success the view replaces the draft and `then` runs. */
  const write = useCallback(
    async (view: WeeklyView_Serialize, sent: Draft, complete: boolean, then: number) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      setLine(null);
      setPriorityTooLong(false);
      const name = complete ? "weekly_complete" : "weekly_save";
      try {
        const call = complete ? commands.weeklyComplete : commands.weeklySave;
        const result = await call(view.weekStart, draftToSend(sent));
        if (!live.current) return;
        if (result.status === "ok") {
          setDraft(draftOf(result.data));
          setLoad({ status: "ok", view: result.data });
          setStep(then);
        } else {
          // The draft stays for another try; Rust's last view stands.
          console.error(`${name} failed`, result.error);
          if (result.error === "tooLong") {
            const found = tooLong(sent);
            setLine(found.line);
            setPriorityTooLong(found.priority);
          } else setLine(SAVE_LINES[result.error] ?? SAVE_FAILED);
        }
      } catch (error) {
        console.error(`${name} failed`, error);
        if (live.current) setLine(SAVE_FAILED);
      } finally {
        working.current = false;
        if (live.current) setBusy(false);
      }
    },
    [],
  );

  /** Continue: applies the current step, then shows the next. */
  const next = useCallback(() => {
    if (load.status !== "ok") return Promise.resolve();
    if (step === 1) return write(load.view, draft, false, 2);
    if (step === 2) return write(load.view, draft, true, 3);
    setLine(null);
    setStep((now) => now + 1);
    return Promise.resolve();
  }, [load, step, draft, write]);

  /** Not now: on the improvement step it drops the typing; on the priorities it completes as saved. */
  const skip = useCallback(() => {
    if (load.status !== "ok") return;
    const saved = draftOf(load.view);
    setLine(null);
    setPriorityTooLong(false);
    if (step === 1) {
      setDraft(saved);
      setStep(2);
    } else if (step === 2) void write(load.view, saved, true, 3);
  }, [load, step, write]);

  const back = useCallback(() => {
    setLine(null);
    setPriorityTooLong(false);
    setStep((now) => Math.max(0, now - 1));
  }, []);

  const change = useCallback((patch: Partial<Draft>) => {
    setPriorityTooLong(false);
    setDraft((now) => ({ ...now, ...patch }));
  }, []);

  return { load, step, draft, line, priorityTooLong, busy, change, next, skip, back, retry: read };
}
