import type { KeyboardView_Serialize, NoteView } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend, KEYBOARD } from "./backend";

export const BOARD: Record<string, Handler> = {};

// Board's Inbox list: 0, 1 and 50 notes, a very long note, and a list that will not load.
const BOARD_KEYBOARD: KeyboardView_Serialize = KEYBOARD;
const boardNote = (i: number, text: string): NoteView => ({
  id: `note-${i}`,
  text,
  kind: i % 2 === 0 ? "internal" : "external",
  createdAt: i < 3 ? "14:32" : "Yesterday 09:05",
  createdAtLabel: i < 3 ? "Today at 14:32" : "Yesterday at 09:05",
});
const boardNotes = (count: number): NoteView[] =>
  Array.from({ length: count }, (_, i) =>
    boardNote(count - i, i === 1 ? "Wordy".repeat(200) : `Note ${count - i}: email the landlord`),
  );
const boardBackend = (notes: () => unknown): Handler =>
  backend({
    replies: {
      inbox_list: notes,
      inbox_remove: () => null,
      inbox_restore: () => null,
      keyboard_state: () => BOARD_KEYBOARD,
    },
  });
BOARD.boardEmpty = boardBackend(() => []);
BOARD.boardOne = boardBackend(() => boardNotes(1));
BOARD.boardFifty = boardBackend(() => boardNotes(50));
BOARD.boardLong = boardBackend(() => [
  boardNote(
    1,
    `${"A thought that goes on and on, ".repeat(30)}\nand has a second line.`
      .padEnd(1000, " words")
      .slice(0, 1000),
  ),
  boardNote(2, "Supercalifragilisticexpialidocious".repeat(6)),
]);
BOARD.boardUnreadable = boardBackend(() => Promise.reject("store"));
