import type { BoardError } from "@shared/ipc/bindings";

/** What a refused or failed board command says. Anything not listed is the plain failure. */
const WORDS: Partial<Record<BoardError, string>> = {
  tooManyColumns: "Up to 4 extra columns.",
  columnNotEmpty: "Move its tasks out first.",
  columnNotFound: "That column is gone. Pick another.",
  badColumnName: "Another column has that name.",
  badLimit: "That limit isn't allowed here.",
  notFound: "That task is gone.",
};

/** The words for `error`, a typed refusal from Rust or a failure to reach it. */
export function boardWords(error: BoardError | "unreachable"): string {
  return (error === "unreachable" ? undefined : WORDS[error]) ?? "That didn't save. Try again.";
}
