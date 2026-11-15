import { mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { YourData } from "./YourData";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("your_data_import_opens_board_sheet", async () => {
  mockBackend();
  const onImportTasks = vi.fn();
  render(<YourData headingRef={createRef()} onImportTasks={onImportTasks} />);
  await settle();
  const row = screen.getByRole("group", { name: "Tasks from other apps" });
  expect(row).toHaveTextContent("Reminders, Todoist or Things");
  const button = screen.getByRole("button", { name: "Import tasks…" });
  expect(row).toContainElement(button);
  expect(button).toHaveAttribute("data-variant", "quiet");
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  expect(onImportTasks).toHaveBeenCalledTimes(1);
});
