import { commands, events, type KeyboardView, type NoteView } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useRef, useState } from "react";

/** How long "Note removed." with Undo stays, unless the next removal replaces it. */
export const UNDO_MS = 10_000;

export type Inbox =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; notes: NoteView[] };

/** The line under the heading: the answer to the person's last action. */
export type Line = "removed" | "removeFailed" | "restoreFailed" | null;

function insertAt(notes: NoteView[], note: NoteView, index: number): NoteView[] {
  if (notes.some((n) => n.id === note.id)) return notes;
  const copy = [...notes];
  copy.splice(Math.min(index, copy.length), 0, note);
  return copy;
}

/**
 * The live notes (newest first), kept current by `inbox-changed`, and Remove with Undo.
 * Remove hides at once; a failure puts the note back and says so. A load failure is `error`,
 * never an empty list.
 */
export function useInbox() {
  const [inbox, setInbox] = useState<Inbox>({ status: "loading" });
  const [line, setLine] = useState<Line>(null);
  const removed = useRef<{ note: NoteView; index: number; done: Promise<void> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fresh = useRef(false);

  const load = useCallback(() => {
    commands.inboxList().then(
      (result) => {
        if (fresh.current) return;
        if (result.status === "ok") setInbox({ status: "ok", notes: result.data });
        else setInbox({ status: "error" });
      },
      (error: unknown) => {
        console.error("inbox_list failed", error);
        if (fresh.current) return;
        setInbox({ status: "error" });
      },
    );
  }, []);

  useEffect(() => {
    // An event is newer than any list asked for before it arrived.
    const stop = subscribe("inbox-changed", events.inboxChanged.listen, (notes) => {
      fresh.current = true;
      setInbox({ status: "ok", notes });
    });
    load();
    return () => {
      stop();
      clearTimeout(timer.current);
    };
  }, [load]);

  const retry = useCallback(() => {
    fresh.current = false;
    setInbox({ status: "loading" });
    load();
  }, [load]);

  const showLine = useCallback((next: Line) => {
    clearTimeout(timer.current);
    setLine(next);
    if (next === "removed") timer.current = setTimeout(() => setLine(null), UNDO_MS);
  }, []);

  const put = useCallback((note: NoteView, index: number) => {
    setInbox((current) =>
      current.status === "ok"
        ? { status: "ok", notes: insertAt(current.notes, note, index) }
        : current,
    );
  }, []);

  const remove = useCallback(
    (id: string) => {
      if (inbox.status !== "ok") return;
      const index = inbox.notes.findIndex((n) => n.id === id);
      const note = inbox.notes[index];
      if (!note) return;
      const forget = () => {
        if (removed.current?.note.id === note.id) removed.current = null;
      };
      const fail = (error: unknown) => {
        console.error("inbox_remove failed", error);
        forget();
        put(note, index);
        showLine("removeFailed");
      };
      const done = commands.inboxRemove(id).then((result) => {
        if (result.status === "ok") return;
        if (result.error === "notFound") {
          // Already gone: the list is right, but there is nothing to undo.
          forget();
          if (removed.current === null) showLine(null);
          return;
        }
        fail(result.error);
      }, fail);
      removed.current = { note, index, done };
      setInbox({ status: "ok", notes: inbox.notes.filter((n) => n.id !== id) });
      showLine("removed");
    },
    [inbox, put, showLine],
  );

  /**
   * Brings the last removed note back in place. `focus` is told the row to focus (-1 for the heading)
   * just before the render that follows, so focus never drops to the page.
   */
  const undo = useCallback(
    async (focus: (row: number) => void): Promise<void> => {
      const last = removed.current;
      if (!last) return;
      showLine(null);
      // A restore must not overtake the remove it undoes.
      await last.done;
      if (removed.current !== last) {
        // The remove failed (the note is back and said so) or a newer removal took over.
        focus(-1);
        return;
      }
      const failed = (error: unknown) => {
        console.error("inbox_restore failed", error);
        focus(-1);
        showLine("restoreFailed");
      };
      try {
        const result = await commands.inboxRestore(last.note.id);
        if (result.status === "error" && result.error !== "notFound") return failed(result.error);
        // notFound means the note is live already: show it.
        if (removed.current === last) removed.current = null;
        focus(last.index);
        put(last.note, last.index);
      } catch (error) {
        failed(error);
      }
    },
    [put, showLine],
  );

  return { inbox, line, remove, undo, retry };
}

/** The capture shortcut's keys as shown, null when it is off or failed, undefined until known. */
export function useCaptureKeys(): string | null | undefined {
  const [keys, setKeys] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let newer = false;
    const show = (view: KeyboardView) => {
      const { status, display } = view.capture;
      setKeys(status === "registered" && display ? display : null);
    };
    commands.keyboardState().then(
      (view) => {
        // An event is newer than an answer asked for before it arrived.
        if (!cancelled && !newer) show(view);
      },
      (error: unknown) => {
        console.error("keyboard_state failed", error);
        if (!cancelled && !newer) setKeys(null);
      },
    );
    const stop = subscribe("keyboard-changed", events.keyboardChanged.listen, (view) => {
      newer = true;
      show(view);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return keys;
}
