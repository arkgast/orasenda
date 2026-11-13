import {
  EmptyState,
  InboxRow,
  InlineNotice,
  type NavPage,
  PageFrame,
  ScrollRegion,
} from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import type { NoteView } from "@shared/ipc/bindings";
import { useLayoutEffect, useRef } from "react";
import { PagesButton } from "../../app/PagesButton";
import { type Line, useCaptureKeys, useInbox } from "./useInbox";
import "./board.css";

const NAME_LENGTH = 40;

/** "Remove note: " and the note's first 40 characters. */
function removeName(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return `Remove note: ${chars.slice(0, NAME_LENGTH).join("")}${chars.length > NAME_LENGTH ? "…" : ""}`;
}

const LINES: Record<Exclude<Line, null>, string> = {
  removed: "Note removed.",
  removeFailed: "Couldn't remove the note. It's still in your Inbox.",
  restoreFailed: "Couldn't bring the note back.",
};

export function BoardPage({ onNavigate }: { onNavigate(page: NavPage): void }) {
  const { compact } = useWindowLayout();
  const { inbox, line, remove, undo, retry } = useInbox();
  const keys = useCaptureKeys();
  const root = useRef<HTMLDivElement>(null);
  // The row whose Remove takes focus after the next render; -1 is the heading.
  const focusRow = useRef<number | null>(null);
  const notes: NoteView[] = inbox.status === "ok" ? inbox.notes : [];

  // After every render: the ref is set only by a Remove or Undo and is cleared as it is used.
  useLayoutEffect(() => {
    const row = focusRow.current;
    if (row === null) return;
    focusRow.current = null;
    const button = root.current
      ?.querySelectorAll<HTMLElement>("ul > li")
      [row]?.querySelector("button");
    (button ?? root.current?.querySelector<HTMLElement>("h1"))?.focus();
  });

  const onRemove = (id: string) => {
    const index = notes.findIndex((n) => n.id === id);
    // The next row slides into this place; the last row falls back to the one before it.
    focusRow.current = index < notes.length - 1 ? index : index - 1;
    remove(id);
  };

  const onUndo = () =>
    undo((row) => {
      focusRow.current = row;
    });

  const failed = inbox.status === "error";
  const status = failed ? (
    <InlineNotice
      variant="row"
      tone="attention"
      actionLabel="Try again"
      actionName="Try again loading the Inbox"
      onAction={retry}
    >
      Orasenda can't read your Inbox right now.
    </InlineNotice>
  ) : (
    <InlineNotice
      variant="row"
      tone={line === "removed" || line === null ? "neutral" : "attention"}
      actionLabel={line === "removed" ? "Undo" : undefined}
      actionName={line === "removed" ? "Undo removing the note" : undefined}
      onAction={line === "removed" ? onUndo : undefined}
    >
      {line ? LINES[line] : ""}
    </InlineNotice>
  );

  return (
    <div ref={root} className="app-board-page">
      <PageFrame
        title="Inbox"
        compactPicker={
          compact ? <PagesButton current="board" onNavigate={onNavigate} /> : undefined
        }
        status={status}
      >
        <ScrollRegion label="Inbox">
          {inbox.status === "ok" && notes.length === 0 ? (
            keys === undefined ? null : (
              <EmptyState
                title="Nothing in your Inbox."
                message={
                  keys
                    ? `${keys} captures a thought from anywhere.`
                    : "Capture a thought from the menu bar."
                }
              />
            )
          ) : (
            // list-style none makes WebKit drop the list role, so it is stated.
            // biome-ignore lint/a11y/noRedundantRoles: keeps the list role for VoiceOver
            <ul className="app-board-list" role="list">
              {notes.map((note) => (
                <InboxRow
                  key={note.id}
                  text={note.text}
                  kind={note.kind}
                  time={note.createdAt}
                  timeLabel={note.createdAtLabel}
                  removeName={removeName(note.text)}
                  onRemove={() => onRemove(note.id)}
                />
              ))}
            </ul>
          )}
        </ScrollRegion>
      </PageFrame>
    </div>
  );
}
