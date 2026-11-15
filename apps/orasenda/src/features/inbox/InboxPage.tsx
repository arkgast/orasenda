import { useSingleKeySetting } from "@domain/keyboard/useSingleKeySetting";
import { PagesButton } from "@domain/navigation/PagesButton";
import { EmptyState, InboxRow, type NavPage, PageFrame, ScrollRegion } from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import type { NoteView } from "@shared/ipc/bindings";
import { type KeyboardEvent, useRef } from "react";
import { InboxStatus } from "./InboxStatus";
import { useCaptureKeys, useInbox } from "./useInbox";
import { useRovingRows } from "./useRovingRows";
import "./inbox.css";

const NAME_LENGTH = 40;

/** The note's first 40 characters, for a button's name. */
export function noteName(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return `${chars.slice(0, NAME_LENGTH).join("")}${chars.length > NAME_LENGTH ? "…" : ""}`;
}

export function InboxPage({ onNavigate }: { onNavigate(page: NavPage): void }) {
  const { compact } = useWindowLayout();
  const { inbox, line, remove, undo, move, undoMove, retry } = useInbox();
  const keys = useCaptureKeys();
  const singleKey = useSingleKeySetting().on;
  const root = useRef<HTMLDivElement>(null);
  const notes: NoteView[] = inbox.status === "ok" ? inbox.notes : [];
  const roving = useRovingRows(
    root,
    notes.map((n) => n.id),
  );

  const onRemove = (id: string) => {
    const index = notes.findIndex((n) => n.id === id);
    // The next row slides into this place; the last row falls back to the one before it.
    roving.focusAfter(index < notes.length - 1 ? index : index - 1);
    remove(id);
  };
  const onMove = (id: string) => void move(id, roving.focusAfter);
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number, id: string) => {
    if (roving.onArrow(event, index)) return;
    // B moves the focused row, only with single keys on; a held key moves one note, not the next.
    if (event.target !== event.currentTarget || event.repeat || !singleKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== "b") return;
    event.preventDefault();
    onMove(id);
  };

  const status = (
    <InboxStatus
      failed={inbox.status === "error"}
      line={line}
      onRetry={retry}
      onUndoRemove={() => void undo(roving.focusAfter)}
      onUndoMove={() => void undoMove(roving.focusAfter)}
      onOpenBoard={() => onNavigate("board")}
    />
  );

  return (
    <div ref={root} className="app-inbox-page">
      <PageFrame
        title="Inbox"
        compactPicker={
          compact ? <PagesButton current="inbox" onNavigate={onNavigate} /> : undefined
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
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: focus bubbles from the rows, which hold the roving stop
            <ul className="app-inbox-list" role="list" onFocus={roving.onFocus}>
              {notes.map((note, index) => (
                <InboxRow
                  key={note.id}
                  text={note.text}
                  kind={note.kind}
                  time={note.createdAt}
                  timeLabel={note.createdAtLabel}
                  removeName={`Remove note: ${noteName(note.text)}`}
                  onRemove={() => onRemove(note.id)}
                  onMoveToBoard={() => onMove(note.id)}
                  moreName={`More actions for ${noteName(note.text)}`}
                  tabIndex={roving.tabIndex(index)}
                  menuTabIndex={-1}
                  onKeyDown={(event) => onKeyDown(event, index, note.id)}
                />
              ))}
            </ul>
          )}
        </ScrollRegion>
      </PageFrame>
    </div>
  );
}
