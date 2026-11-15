import { argsOf, emitBoardNotice, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { card, renderBoard } from "./BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const startOnIntro = async (replies = {}) => {
  const backend = await renderBoard({ replies });
  const el = card("Write intro");
  el.focus();
  fireEvent.keyDown(el, { key: "Enter", metaKey: true });
  await settle();
  return backend;
};

test("board_start_on_links_task", async () => {
  const backend = await startOnIntro({ timer_start: () => RUNNING });
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false, taskId: "t1" } }]);
});

test("board_start_on_says_task_gone", async () => {
  await startOnIntro({
    timer_start: () => {
      throw { kind: "taskNotFound", message: "gone" };
    },
  });
  expect(
    screen.getByText("That task is gone. Pick another or start without one."),
  ).toBeInTheDocument();
});

test("board_start_on_says_task_done", async () => {
  await startOnIntro({
    timer_start: () => {
      throw { kind: "taskDone", message: "done" };
    },
  });
  expect(screen.getByText("Move it out of Done first.")).toBeInTheDocument();
});

test("board_notice_shows_line", async () => {
  await renderBoard();
  await emitBoardNotice("notSaved", "The board didn't update. Try again.");
  expect(screen.getByText("The board didn't update. Try again.")).toBeInTheDocument();
});
