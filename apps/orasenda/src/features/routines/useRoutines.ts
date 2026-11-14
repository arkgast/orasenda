import {
  commands,
  events,
  type RoutinesError,
  type RoutinesView_Serialize,
  type RunView_Serialize,
  type TemplateId,
} from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoutinesView = RoutinesView_Serialize;

export type Routines =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; view: RoutinesView };

/** A worded line for the status row, with at most one action (Undo, Try again). */
export type Notice = {
  text: string;
  tone: "neutral" | "attention";
  action?: { label: string; name: string; run(): void };
};

/** The status row's line: the answer to the person's last action. Every new action clears it. */
export type Line = "writeFailed" | "readFailed" | "startFailed" | Notice | null;

/** What a write answered: ok (with Rust's data, such as a new id), a refusal, or no answer. */
export type Outcome =
  | { status: "ok"; data?: unknown }
  | { status: "error"; error: RoutinesError | "unreachable" };

/** Sends one routines command through the page's chain and resolves with what it answered. */
export type WriteFn = (name: string, send: () => Promise<Answer>) => Promise<Outcome>;

export type RunView = RunView_Serialize;

/** What a `run_*` call answered: the run it acted on (even when that just ended), or why not. */
export type RunAnswer =
  | { status: "ok"; run: RunView }
  | { status: "error"; error: RoutinesError | "unreachable" };

type Answer = { status: "ok"; data: unknown } | { status: "error"; error: RoutinesError };

type Write = {
  /** Writes with the same key replace each other while waiting: the newest intent wins. */
  key: string;
  name: string;
  send: () => Promise<Answer>;
  settle?: (outcome: Outcome) => void;
};

let writeSeq = 0;

/**
 * The last routines write sent from any mounted page. A page left while its writes are queued keeps
 * sending them (they are the person's intents, already shown), and a page mounted after it chains
 * behind them, so one write is in flight across navigation too.
 */
let lastWrite: Promise<unknown> = Promise.resolve();

function sendInTurn(send: () => Promise<Answer>): Promise<Answer> {
  const answer = lastWrite.then(send);
  lastWrite = answer.catch(() => {});
  return answer;
}

/** A view with the check-ins that have not been answered yet laid over it. */
function withChecks(view: RoutinesView, checks: ReadonlyMap<string, boolean>): RoutinesView {
  if (checks.size === 0) return view;
  const habit = <H extends { id: string; doneToday: boolean }>(h: H): H =>
    checks.has(h.id) ? { ...h, doneToday: checks.get(h.id) as boolean } : h;
  return {
    ...view,
    routines: view.routines.map((r) => ({ ...r, habits: r.habits.map(habit) })),
    habits: view.habits.map(habit),
  };
}

/**
 * The routines from `routines_list`, kept current by `routines-changed`, and the page's writes.
 * Writes are chained (conventions, *Newest wins*): one call in flight, and a waiting write is
 * replaced by a newer one with the same key. A check-in shows at once and rolls back to the last
 * view Rust sent if it fails. An Ok with no event since it was sent reads the list again (R5: a
 * committed write whose read-back fails answers Ok without `routines-changed`).
 */
export function useRoutines() {
  const [routines, setRoutines] = useState<Routines>({ status: "loading" });
  const [checks, setChecks] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [line, setLine] = useState<Line>(null);
  const events_ = useRef(0);
  const lists = useRef(0);
  const queue = useRef<Write[]>([]);
  const busy = useRef(false);
  const inFlight = useRef<string | null>(null);
  const live = useRef(true);
  /** A write with this key is in flight or waiting. */
  const pending = useCallback(
    (key: string) => inFlight.current === key || queue.current.some((w) => w.key === key),
    [],
  );

  const shownView = useRef(false);
  const take = useCallback(
    (view: RoutinesView) => {
      shownView.current = true;
      setRoutines({ status: "ok", view });
      // A check-in still queued or in flight stays over Rust's view; an answered one gives way.
      setChecks((current) => {
        const next = new Map([...current].filter(([id]) => pending(`check:${id}`)));
        return next.size === current.size ? current : next;
      });
    },
    [pending],
  );

  /** Reads the list. An event that lands after the call was sent is newer, so the answer is dropped. */
  const load = useCallback((): Promise<void> => {
    const seenEvents = events_.current;
    const seq = ++lists.current;
    const stale = () => !live.current || events_.current !== seenEvents || seq !== lists.current;
    const failed = (error: unknown) => {
      console.error("routines_list failed", error);
      if (stale()) return;
      // With a view on screen it stays, and the line says the read failed; else the page has none.
      if (shownView.current) setLine("readFailed");
      else setRoutines({ status: "error" });
    };
    return commands.routinesList().then((result) => {
      if (result.status === "error") return failed(result.error);
      if (!stale()) take(result.data);
    }, failed);
  }, [take]);

  useEffect(() => {
    live.current = true;
    const stop = subscribe("routines-changed", events.routinesChanged.listen, (view) => {
      events_.current += 1;
      take(view as RoutinesView);
    });
    load();
    return () => {
      live.current = false;
      stop();
    };
  }, [load, take]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    for (let write = queue.current.shift(); write; write = queue.current.shift()) {
      const seenEvents = events_.current;
      inFlight.current = write.key;
      let outcome: Outcome;
      try {
        const answer = await sendInTurn(write.send);
        outcome = answer.status === "ok" ? { status: "ok", data: answer.data } : answer;
      } catch (error) {
        console.error(`${write.name} failed`, error);
        outcome = { status: "error", error: "unreachable" };
      }
      if (outcome.status === "error" && outcome.error !== "unreachable") {
        console.error(`${write.name} refused`, outcome.error);
      }
      inFlight.current = null;
      if (!live.current) continue;
      if (outcome.status === "ok" && events_.current === seenEvents) await load();
      write.settle?.(outcome);
    }
    busy.current = false;
  }, [load]);

  const push = useCallback(
    (write: Write) => {
      const at = queue.current.findIndex((w) => w.key === write.key);
      if (at >= 0) {
        // The replaced write never runs; its caller hears the newer one's answer through its own.
        queue.current[at]?.settle?.({ status: "ok" });
        queue.current[at] = write;
      } else queue.current.push(write);
      void pump();
    },
    [pump],
  );

  const check = useCallback(
    (id: string, done: boolean) => {
      setLine(null);
      setChecks((current) => new Map(current).set(id, done));
      push({
        key: `check:${id}`,
        name: "habit_check",
        send: () => commands.habitCheck(id, done),
        settle: (outcome) => {
          if (outcome.status === "ok") return;
          // Back to the last view Rust sent, unless a newer intent for this habit is waiting.
          if (!pending(`check:${id}`)) {
            setChecks((current) => {
              const next = new Map(current);
              next.delete(id);
              return next;
            });
          }
          setLine("writeFailed");
        },
      });
    },
    [push, pending],
  );

  const addTemplate = useCallback(
    (template: TemplateId): Promise<Outcome> =>
      new Promise((resolve) => {
        setLine(null);
        push({
          key: `add:${++writeSeq}`,
          name: "routine_add_template",
          send: () => commands.routineAddTemplate(template),
          settle: resolve,
        });
      }),
    [push],
  );

  const move = useCallback(
    (kind: "routine" | "habit", id: string, toIndex: number, moved?: () => void) => {
      setLine(null);
      push({
        key: `move:${++writeSeq}`,
        name: `${kind}_move`,
        send: () =>
          kind === "routine" ? commands.routineMove(id, toIndex) : commands.habitMove(id, toIndex),
        settle: (outcome) => {
          if (outcome.status === "error" && outcome.error !== "notFound") setLine("writeFailed");
          moved?.();
        },
      });
    },
    [push],
  );

  /** One write for the editors and Remove with Undo; the caller words its answer. */
  const write: WriteFn = useCallback(
    (name, send) =>
      new Promise((resolve) => push({ key: `write:${++writeSeq}`, name, send, settle: resolve })),
    [push],
  );

  /** Sends a `run_*` call in turn with the page's other writes and answers with Rust's run. */
  const runCall = useCallback(
    (
      name: string,
      send: () => Promise<
        { status: "ok"; data: RunView } | { status: "error"; error: RoutinesError }
      >,
    ): Promise<RunAnswer> =>
      new Promise((resolve) => {
        let run: RunView | null = null;
        push({
          key: `run:${++writeSeq}`,
          name,
          send: async () => {
            const answer = await send();
            if (answer.status === "ok") run = answer.data;
            return answer;
          },
          settle: (outcome) => {
            if (outcome.status === "error") resolve(outcome);
            else if (run) resolve({ status: "ok", run });
            // An Ok with no run is not success: it reads as a failure to reach Rust.
            else resolve({ status: "error", error: "unreachable" });
          },
        });
      }),
    [push],
  );

  const retry = useCallback(() => {
    setLine(null);
    setRoutines((current) => (current.status === "error" ? { status: "loading" } : current));
    void load();
  }, [load]);

  const shown: Routines = useMemo(
    () =>
      routines.status === "ok"
        ? { status: "ok", view: withChecks(routines.view, checks) }
        : routines,
    [routines, checks],
  );

  return { routines: shown, line, setLine, check, addTemplate, move, write, runCall, retry };
}
