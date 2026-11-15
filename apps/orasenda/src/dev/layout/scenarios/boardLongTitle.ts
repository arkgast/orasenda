import { backend, type Handler } from "./backend";
import { board, task } from "./boardData";

// One Today task with a 300-character title and nothing else: the card clamps the title.
const TITLE =
  "Plan the whole of the autumn writing project, including the outline, the interviews, the first draft and every round of edits that follows, "
    .repeat(3)
    .slice(0, 300)
    .trim();

export const BOARD_LONG_TITLE: Record<string, Handler> = {
  boardLongTitle: backend({
    replies: { board_get: () => board([task("t1", TITLE, "today")]) },
  }),
};
