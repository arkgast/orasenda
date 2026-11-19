import type { BoardError } from "@shared/ipc/bindings";
import { expect, test } from "vitest";
import { boardWords } from "./boardWords";

const FAILED = "That didn't save. Try again.";

/** Every arm of `BoardError`: adding one in Rust breaks this table at typecheck. */
const WORDS: Record<BoardError, string> = {
  titleEmpty: FAILED,
  titleTooLong: FAILED,
  notesTooLong: FAILED,
  badTags: FAILED,
  badEstimate: FAILED,
  badDue: FAILED,
  badChecklist: FAILED,
  badColumns: FAILED,
  doneCannotBeFrog: FAILED,
  notFound: "That task is gone.",
  store: FAILED,
  tooManyColumns: "Up to 4 extra columns.",
  columnNotEmpty: "Move its tasks out first.",
  columnNotFound: "That column is gone. Pick another.",
  badColumnName: "Another column has that name.",
  badLimit: "That limit isn't allowed here.",
};

test("board_words_cover_every_error", () => {
  for (const [error, words] of Object.entries(WORDS)) {
    expect(boardWords(error as BoardError), error).toBe(words);
  }
  expect(boardWords("unreachable")).toBe(FAILED);
});
