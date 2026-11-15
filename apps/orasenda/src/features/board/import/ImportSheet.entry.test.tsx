import { settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BoardPage } from "../BoardPage";
import { renderBoard } from "../BoardPage.support";
import { renderImport, SOURCES } from "./ImportSheet.support";
import { resetImportAsk } from "./importAsk";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetImportAsk();
});

const sources = { import_sources: () => SOURCES };

test("footer_button_opens_sheet", async () => {
  await renderBoard({ replies: sources });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Import tasks…" }));
  await settle();
  expect(screen.getByRole("dialog", { name: "Import tasks" })).toBeInTheDocument();
});

test("empty_board_offers_import", async () => {
  const { boardOf } = await import("@shared/test/fixtures");
  await renderBoard({ board: boardOf([]), replies: sources });
  expect(screen.getByText("Add one, move a note from the Inbox, or import tasks.")).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Import tasks…" }));
  await settle();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("import_asked_opens_once", async () => {
  const opened = vi.fn();
  await renderBoard({ replies: sources, page: { importAsked: 1, onImportOpened: opened } });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(opened).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  // The same value again (a re-render, a remount) never reopens it.
  render(<BoardPage onNavigate={() => {}} importAsked={1} onImportOpened={opened} />);
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opened).toHaveBeenCalledTimes(1);
});

test("focus_first_source_then_list", async () => {
  await renderImport();
  expect(screen.getByRole("button", { name: "Apple Reminders" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Apple Reminders" }));
  await settle();
  expect(screen.getByRole("checkbox", { name: "Renew passport" })).toHaveFocus();
});
