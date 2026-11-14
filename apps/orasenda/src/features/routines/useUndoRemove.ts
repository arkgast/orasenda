import { commands } from "@shared/ipc/bindings";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from "react";
import { moreId } from "./ActionMenu";
import { byId } from "./focusAfter";
import type { Line, Notice, Outcome, WriteFn } from "./useRoutines";

/** How long "Removed <name>." with Undo stays, unless the next action replaces it. */
export const UNDO_MS = 10_000;

/** What Remove takes away: a routine, a standalone habit, or a step (with its routine's name). */
export type Removable = {
  kind: "routine" | "habit";
  id: string;
  name: string;
  /** For a step: the routine it sits in. */
  routine?: { name: string } | null;
};

type Deps = {
  write: WriteFn;
  setLine: Dispatch<SetStateAction<Line>>;
  focus(find: () => HTMLElement | null | undefined): void;
};

const SAFE = "Your data is safe; try again in a moment.";

function fullLine(item: Removable): string {
  const tail = "the most Orasenda keeps. Remove one to bring this one back.";
  if (item.kind === "routine") return `You have 30 routines, ${tail}`;
  if (item.routine) return `${item.routine.name} has 20 steps, ${tail}`;
  return `You have 30 habits on their own, ${tail}`;
}

const undoName = (item: Removable) => `Undo removing ${item.name}`;

/** The Undo action for `item` in the page's status row, if it is drawn. */
const undoButton = (item: Removable): HTMLElement | undefined =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-slot=page-frame-status] button")).find(
    (b) => b.getAttribute("aria-label") === undoName(item),
  );

/**
 * Remove with Undo (spec §Editors). A remove goes through the page's write chain; once Rust has it,
 * the status row says "Removed <name>." with **Undo** for ten seconds or until the next action
 * (every action clears the row), and focus moves to Undo, since the item's own controls are gone.
 * While Undo has focus the row stays (WCAG 2.2.1), so a keyboard or VoiceOver user never loses
 * their place; it leaves ten seconds after focus moves on. Undo restores it and focus returns to
 * its More. Refusals are worded here from `RoutinesError`;
 * nothing fails silently.
 */
export function useUndoRemove(deps: Deps): { remove(item: Removable): void } {
  const latest = useRef(deps);
  latest.current = deps;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The line this hook showed last; a timer or listener for an older one does nothing. */
  const shown = useRef<Notice | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useMemo(() => {
    /** Starts the ten seconds for `notice`; at the end it leaves unless its Undo has focus. */
    const expire = (notice: Notice, item: Removable) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (shown.current !== notice) return;
        const undo = undoButton(item);
        if (undo && undo === document.activeElement) {
          // Held while focused: the ten seconds start again once focus moves on.
          undo.addEventListener(
            "focusout",
            () => {
              if (shown.current === notice) expire(notice, item);
            },
            { once: true },
          );
          return;
        }
        shown.current = null;
        latest.current.setLine((line) => (line === notice ? null : line));
      }, UNDO_MS);
    };

    const show = (notice: Notice | null, expiresFor?: Removable) => {
      clearTimeout(timer.current);
      shown.current = notice;
      latest.current.setLine(notice);
      if (notice && expiresFor) expire(notice, expiresFor);
    };

    const send = (item: Removable, verb: "remove" | "restore"): Promise<Outcome> => {
      const { write } = latest.current;
      const name = `${item.kind}_${verb}`;
      if (item.kind === "routine") {
        return write(name, () =>
          verb === "remove" ? commands.routineRemove(item.id) : commands.routineRestore(item.id),
        );
      }
      return write(name, () =>
        verb === "remove" ? commands.habitRemove(item.id) : commands.habitRestore(item.id),
      );
    };

    const remove = (item: Removable): void => {
      show(null);
      void send(item, "remove").then((outcome) => {
        if (outcome.status === "ok") {
          show(
            {
              text: `Removed ${item.name}.`,
              tone: "neutral",
              action: { label: "Undo", name: undoName(item), run: () => undo(item) },
            },
            item,
          );
          latest.current.focus(() => undoButton(item));
          return;
        }
        if (outcome.error === "notFound") {
          // Removed already, from another window: the list from Rust shows it; nothing to undo.
          return show({ text: `${item.name} was already removed.`, tone: "neutral" });
        }
        show({
          text: `${item.name} wasn't removed. ${SAFE}`,
          tone: "attention",
          action: {
            label: "Try again",
            name: `Try again removing ${item.name}`,
            run: () => remove(item),
          },
        });
      });
    };

    const undo = (item: Removable): void => {
      show(null);
      void send(item, "restore").then((outcome) => {
        const back =
          outcome.status === "ok" ||
          // A routine or standalone habit that is live already is back: nothing to say twice.
          (outcome.error === "notFound" && !item.routine);
        if (back) {
          show({ text: `Brought back ${item.name}.`, tone: "neutral" });
          latest.current.focus(byId(moreId(item.id)));
          return;
        }
        if (outcome.error === "notFound" && item.routine) {
          return show({
            text: `${item.name} comes back only with its routine, and ${item.routine.name} was removed.`,
            tone: "neutral",
          });
        }
        if (outcome.error === "full") return show({ text: fullLine(item), tone: "attention" });
        show({
          text: `${item.name} couldn't be brought back. ${SAFE}`,
          tone: "attention",
          action: {
            label: "Try again",
            name: `Try again bringing back ${item.name}`,
            run: () => undo(item),
          },
        });
      });
    };

    return { remove };
  }, []);
}
