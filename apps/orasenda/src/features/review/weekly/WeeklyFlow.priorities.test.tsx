import { argsOf, settle, weeklyView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TOO_LONG_PRIORITY } from "./useWeekly";
import { addTyped, answerOf, heading, openWeekly, pickTask, press } from "./WeeklyFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

async function toPriorities(replies = {}, view = weeklyView()) {
  const opened = await openWeekly(replies, view);
  await press("Continue");
  await press("Continue");
  expect(heading()).toHaveTextContent("Priorities");
  return opened;
}

test("fourth_picker_never_shown", async () => {
  await toPriorities();
  expect(screen.getAllByRole("button", { name: /^Add priority/ })).toHaveLength(1);
  await pickTask(1, "sync", "Fix sync bug");
  await pickTask(2, "notes", "Write notes");
  expect(screen.getByRole("button", { name: "Add priority 3" })).toBeInTheDocument();
  await addTyped(3, "Plan the quarter");
  expect(screen.queryByRole("button", { name: /^Add priority/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: /^Task: / })).toHaveLength(3);
});

test("nothing_is_picked_for_the_person", async () => {
  const { backend } = await toPriorities();
  await press("Continue");
  expect(argsOf(backend.calls, "weekly_complete")).toEqual([
    { weekStart: "2026-11-23", draft: { improvement: null, notes: null, priorities: [] } },
  ]);
});

test("back_and_continue_no_second_task", async () => {
  const { backend } = await toPriorities();
  await addTyped(1, "Plan the quarter");
  await press("Back");
  expect(heading()).toHaveTextContent("One improvement");
  await press("Continue");
  await press("Continue");
  const calls = [
    ...argsOf(backend.calls, "weekly_save"),
    ...argsOf(backend.calls, "weekly_complete"),
  ] as Array<{ draft: { priorities: Array<{ newTitle?: string }> } }>;
  const typed = calls.flatMap((c) => c.draft.priorities).filter((p) => p.newTitle);
  expect(typed).toEqual([{ newTitle: "Plan the quarter" }]);
  expect(heading()).toHaveTextContent("Week planned.");
});

test("a_blank_typed_title_is_not_sent", async () => {
  const { backend } = await toPriorities();
  fireEvent.click(screen.getByRole("button", { name: "Add priority 1" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "   " } });
  expect(screen.queryByRole("option", { name: /to Backlog/ })).toBeNull();
  await press("Continue");
  expect(argsOf(backend.calls, "weekly_complete")).toEqual([
    { weekStart: "2026-11-23", draft: { improvement: null, notes: null, priorities: [] } },
  ]);
});

test("the_same_task_is_not_offered_twice", async () => {
  await toPriorities();
  await pickTask(1, "sync", "Fix sync bug");
  fireEvent.click(screen.getByRole("button", { name: "Add priority 2" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "sync" } });
  expect(screen.queryByRole("option", { name: /Fix sync bug/ })).toBeNull();
});

test("clearing_a_priority_removes_its_slot", async () => {
  const { backend } = await toPriorities();
  await pickTask(1, "sync", "Fix sync bug");
  await pickTask(2, "notes", "Write notes");
  fireEvent.click(screen.getAllByRole("button", { name: "Clear task" })[0] as HTMLElement);
  await press("Continue");
  expect(argsOf(backend.calls, "weekly_complete")).toEqual([
    {
      weekStart: "2026-11-23",
      draft: { improvement: null, notes: null, priorities: [{ task: "t2" }] },
    },
  ]);
});

test("too_long_line_words_are_pinned", () => {
  expect(TOO_LONG_PRIORITY).toBe("Keep a priority to 200 characters.");
});

test("too_long_priority_shows_the_line_next_to_its_picker_and_keeps_the_draft", async () => {
  const { backend } = await toPriorities({
    weekly_complete: () => {
      throw "tooLong";
    },
  });
  await addTyped(1, "x".repeat(201));
  await press("Continue");
  expect(screen.getByText(TOO_LONG_PRIORITY).closest('[role="status"]')).not.toBeNull();
  expect(heading()).toHaveTextContent("Priorities");
  expect(screen.getAllByRole("button", { name: /^Task: / })).toHaveLength(1);
  expect(argsOf(backend.calls, "weekly_complete")).toHaveLength(1);
});

test("a_gone_task_answers_a_calm_line_and_keeps_the_draft", async () => {
  await toPriorities({
    weekly_complete: () => {
      throw "notFound";
    },
  });
  await pickTask(1, "sync", "Fix sync bug");
  await press("Continue");
  expect(screen.getByText(/no longer on your board/)).toBeInTheDocument();
  expect(heading()).toHaveTextContent("Priorities");
  expect(screen.getByRole("button", { name: /^Task: Fix sync bug/ })).toBeInTheDocument();
});

test("a_save_failure_says_so_and_stays", async () => {
  await toPriorities({
    weekly_complete: () => {
      throw "store";
    },
  });
  await press("Continue");
  expect(screen.getByText("Orasenda can't save your reflection right now.")).toBeInTheDocument();
  expect(heading()).toHaveTextContent("Priorities");
});

test("saved_priorities_come_back_from_the_view", async () => {
  await toPriorities(
    {},
    weeklyView({
      answers: {
        improvement: null,
        notes: null,
        priorities: [{ taskId: "t1", title: "Fix sync bug", done: false, line: "x" }],
      },
    }),
  );
  expect(screen.getByRole("button", { name: /^Task: Fix sync bug/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add priority 2" })).toBeInTheDocument();
});

test("too_long_priority_from_step_two_shows_its_line_at_the_top_of_step_two", async () => {
  let saves = 0;
  const { backend } = await toPriorities({
    weekly_save: (args: unknown) => {
      saves += 1;
      if (saves > 1) throw "tooLong";
      return answerOf(weeklyView())(args);
    },
  });
  await addTyped(1, "x".repeat(201));
  await press("Back");
  await press("Continue");
  expect(heading()).toHaveTextContent("One improvement");
  expect(screen.getByText(TOO_LONG_PRIORITY)).toBeInTheDocument();
  expect(argsOf(backend.calls, "weekly_save")).toHaveLength(2);
});
