import { useCallback, useEffect, useRef, useState } from "react";
import { commands, events, type KeyboardView, type NoteView } from "../../ipc/bindings";
import { subscribe } from "../../ipc/subscribe";

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
  const removed = useRef<{ note: NoteView; index: number } | null>(null);
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
      removed.current = { note, index };
      setInbox({ status: "ok", notes: inbox.notes.filter((n) => n.id !== id) });
      showLine("removed");
      commands.inboxRemove(id).then(
        (result) => {
          if (result.status === "ok") return;
          if (result.error === "notFound") {
            // Already gone: the list is right, but there is nothing to undo.
            removed.current = null;
            showLine(null);
            return;
          }
          console.error("inbox_remove failed", result.error);
          removed.current = null;
          put(note, index);
          showLine("removeFailed");
        },
        (error: unknown) => {
          console.error("inbox_remove failed", error);
          removed.current = null;
          put(note, index);
          showLine("removeFailed");
        },
      );
    },
    [inbox, put, showLine],
  );

  /** Brings the last removed note back in place; answers its row index, or null when it could not. */
  const undo = useCallback(async (): Promise<number | null> => {
    const last = removed.current;
    if (!last) return null;
    showLine(null);
    const failed = (error: unknown) => {
      console.error("inbox_restore failed", error);
      showLine("restoreFailed");
      return null;
    };
    try {
      const result = await commands.inboxRestore(last.note.id);
      if (result.status === "error" && result.error !== "notFound") return failed(result.error);
      removed.current = null;
      if (result.status === "error") return null;
      put(last.note, last.index);
      return last.index;
    } catch (error) {
      return failed(error);
    }
  }, [put, showLine]);

  return { inbox, line, remove, undo, retry };
}

/** The capture shortcut's keys as shown, or null when it is off or failed. */
export function useCaptureKeys(): string | null {
  const [keys, setKeys] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const show = (view: KeyboardView) => {
      const { status, display } = view.capture;
      setKeys(status === "registered" && display ? display : null);
    };
    commands.keyboardState().then(
      (view) => {
        if (!cancelled) show(view);
      },
      (error: unknown) => console.error("keyboard_state failed", error),
    );
    const stop = subscribe("keyboard-changed", events.keyboardChanged.listen, show);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return keys;
}
