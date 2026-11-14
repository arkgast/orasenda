import { boardOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderBoard, TASKS } from "./BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("failure_line_not_empty_board", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderBoard({
    replies: {
      board_get: () => {
        throw new Error("store");
      },
    },
  });
  expect(screen.getByText("The board couldn't be loaded. Try again.")).toBeInTheDocument();
  expect(screen.queryByText(/No tasks yet/)).toBeNull();
  expect(screen.getByRole("button", { name: "Try again loading the board" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again loading the board" }));
});

test("columns read their limits in words and Done is a folded strip", async () => {
  await renderBoard();
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument();
  expect(screen.getByText("2 of 3")).toBeInTheDocument();
  expect(screen.getByText("At limit")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("Today's footer reads the planned sessions with the buffer", async () => {
  await renderBoard({ board: boardOf(TASKS, { todayPlanned: 3 }) });
  expect(screen.getByText("Planned 3 sessions with a 25% buffer")).toBeInTheDocument();
});
