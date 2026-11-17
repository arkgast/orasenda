import {
  commands,
  type ReviewError,
  type ShutdownAnswers,
  type ShutdownView_Serialize,
} from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";

export const STEP_TITLES = ["Unfinished tasks", "Tomorrow", "Reflect", "Shutdown complete."];

export type Draft = { wentWell: string; toImprove: string; outsideControl: string };

export type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; view: ShutdownView_Serialize };

/** The Undo toast: the line Rust worded, and the token while Undo is still on offer. */
export type MoveToast = { line: string; token: string | null };

const MOVE_FAILED = "Orasenda can't move those tasks right now.";
const UNDO_EXPIRED = "That can't be undone now.";
const UNDO_FAILED = "Orasenda can't put those back right now.";
const SAVE_LINES: Partial<Record<ReviewError, string>> = {
  period: "This review is for an earlier day. Open Review again to see today.",
  tooLong: "Please keep each answer under 1,000 characters.",
};
const SAVE_FAILED = "Orasenda can't save your reflection right now.";

const draftOf = (view: ShutdownView_Serialize): Draft => ({
  wentWell: view.answers.wentWell ?? "",
  toImprove: view.answers.toImprove ?? "",
  outsideControl: view.answers.outsideControl ?? "",
});

/** Empty text is no answer; Rust trims the rest. */
const answersOf = (draft: Draft): ShutdownAnswers => ({
  wentWell: draft.wentWell || null,
  toImprove: draft.toImprove || null,
  outsideControl: draft.outsideControl || null,
});

/**
 * The shutdown's state: the view frozen at the shutdown day (`shutdown_get`), the step, the tasks
 * chosen to go back to Backlog, the reflection draft, the Undo toast and the failure line. One
 * call at a time. Moving is optional and never automatic: only chosen tasks move, on Continue.
 */
export function useShutdown() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState<Draft>({ wentWell: "", toImprove: "", outsideControl: "" });
  const [line, setLine] = useState<string | null>(null);
  const [toast, setToast] = useState<MoveToast | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const live = useRef(true);

  const read = useCallback(() => {
    setLoad({ status: "loading" });
    const failed = (error: unknown) => {
      console.error("shutdown_get failed", error);
      if (live.current) setLoad({ status: "error" });
    };
    commands.shutdownGet().then((result) => {
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

  /** Runs one call at a time; a press while one is in flight is not a second call. */
  const exclusive = useCallback(async (call: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setLine(null);
    try {
      await call();
    } finally {
      working.current = false;
      if (live.current) setBusy(false);
    }
  }, []);

  /** Tomorrow's lines count the Today lane, so a move or an Undo changes them: read them again. */
  const refreshTomorrow = useCallback(async () => {
    try {
      const result = await commands.shutdownGet();
      if (!live.current) return;
      if (result.status === "error") {
        console.error("shutdown_get failed", result.error);
        return;
      }
      const { tomorrow } = result.data;
      setLoad((now) =>
        now.status === "ok" ? { status: "ok", view: { ...now.view, tomorrow } } : now,
      );
    } catch (error) {
      // The old lines stay.
      console.error("shutdown_get failed", error);
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setPicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const move = useCallback(
    (ids: string[]) =>
      exclusive(async () => {
        const result = await commands.shutdownMove(ids);
        if (!live.current) return;
        if (result.status === "ok") {
          // A new move replaces the toast of the one before.
          setToast({ line: result.data.line, token: result.data.token });
          setStep(1);
          await refreshTomorrow();
        } else if (result.error === "notFound") {
          // Nothing could move (a session started, or a task was removed): not worth an alarm.
          setToast(null);
          setStep(1);
        } else {
          console.error("shutdown_move failed", result.error);
          setLine(MOVE_FAILED);
        }
      }),
    [exclusive, refreshTomorrow],
  );

  const complete = useCallback(
    (view: ShutdownView_Serialize, answers: ShutdownAnswers) =>
      exclusive(async () => {
        const result = await commands.shutdownComplete(view.day, answers);
        if (!live.current) return;
        if (result.status === "ok") {
          setLoad({ status: "ok", view: result.data });
          setStep(3);
        } else {
          // Rust's last view stands; the typing stays for another try.
          console.error("shutdown_complete failed", result.error);
          setLine(SAVE_LINES[result.error] ?? SAVE_FAILED);
        }
      }),
    [exclusive],
  );

  /** Continue: applies the current step, then shows the next. */
  const next = useCallback(() => {
    if (load.status !== "ok") return Promise.resolve();
    const { view } = load;
    if (step === 0) {
      const ids = view.unfinished.filter((t) => picked.has(t.id) && !t.active).map((t) => t.id);
      if (ids.length > 0) return move(ids);
    }
    if (step === 2) return complete(view, answersOf(draft));
    setLine(null);
    setStep((now) => now + 1);
    return Promise.resolve();
  }, [load, step, picked, draft, move, complete]);

  /** Not now on Reflect: completes with the answers as they were saved. */
  const skipReflect = useCallback(() => {
    if (load.status === "ok") void complete(load.view, load.view.answers);
  }, [load, complete]);

  const undo = useCallback(() => {
    const token = toast?.token;
    if (!token) return;
    void exclusive(async () => {
      const result = await commands.shutdownMoveUndo(token);
      if (!live.current) return;
      if (result.status === "ok") {
        setToast({ line: result.data, token: null });
        await refreshTomorrow();
      } else if (result.error === "notFound") setToast({ line: UNDO_EXPIRED, token: null });
      else {
        console.error("shutdown_move_undo failed", result.error);
        // The token is still good: Undo stays on offer.
        setToast({ line: UNDO_FAILED, token });
      }
    });
  }, [toast, exclusive, refreshTomorrow]);

  return {
    load,
    step,
    picked,
    draft,
    line,
    toast,
    busy,
    toggle,
    setDraft,
    next,
    skipReflect,
    undo,
    dismissToast: () => setToast(null),
    retry: read,
  };
}
