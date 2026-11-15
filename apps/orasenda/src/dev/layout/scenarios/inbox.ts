import type {
  KeyboardView_Serialize,
  NoteView,
  TaskView_Serialize,
} from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend, KEYBOARD } from "./backend";

export const INBOX: Record<string, Handler> = {};

// The Inbox page list: 0, 1 and 50 notes, a very long note, and a list that will not load.
const INBOX_KEYBOARD: KeyboardView_Serialize = KEYBOARD;
const inboxNote = (i: number, text: string): NoteView => ({
  id: `note-${i}`,
  text,
  kind: i % 2 === 0 ? "internal" : "external",
  createdAt: i < 3 ? "14:32" : "Yesterday 09:05",
  createdAtLabel: i < 3 ? "Today at 14:32" : "Yesterday at 09:05",
});
const inboxNotes = (count: number): NoteView[] =>
  Array.from({ length: count }, (_, i) =>
    inboxNote(count - i, i === 1 ? "Wordy".repeat(200) : `Note ${count - i}: email the landlord`),
  );
const MOVED_TASK: TaskView_Serialize = {
  id: "task-1",
  title: "Moved",
  notes: "",
  tags: [],
  kind: "deep",
  estimate: null,
  planned: null,
  due: null,
  dueLabel: null,
  priority: null,
  checklist: [],
  lane: "backlog",
  isFrog: false,
  breakdownDismissed: false,
  sourceNoteId: null,
  doneAt: null,
  tracked: "0h 00m",
  trackedMs: 0,
  sessions: 0,
  active: false,
};
const inboxBackend = (notes: () => unknown): Handler =>
  backend({
    replies: {
      inbox_list: notes,
      inbox_remove: () => null,
      inbox_restore: () => null,
      inbox_to_task: () => MOVED_TASK,
      task_restore_note: () => null,
      keyboard_state: () => INBOX_KEYBOARD,
    },
  });
INBOX.inboxEmpty = inboxBackend(() => []);
INBOX.inboxOne = inboxBackend(() => inboxNotes(1));
INBOX.inboxFifty = inboxBackend(() => inboxNotes(50));
INBOX.inboxLong = inboxBackend(() => [
  inboxNote(
    1,
    `${"A thought that goes on and on, ".repeat(30)}\nand has a second line.`
      .padEnd(1000, " words")
      .slice(0, 1000),
  ),
  inboxNote(2, "Supercalifragilisticexpialidocious".repeat(6)),
]);
INBOX.inboxUnreadable = inboxBackend(() => Promise.reject("store"));
