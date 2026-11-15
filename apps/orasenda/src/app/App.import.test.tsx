import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { emitPaletteOpen, mockBackend, settle } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetImportAsk } from "../features/board/import/importAsk";
import { picked, previewOf, SOURCES, THREE } from "../features/board/import/ImportSheet.support";
import { App } from "./App";

beforeEach(() => {
  stubPaletteDom();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetImportAsk();
});
afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function start() {
  mockBackend({
    import_sources: () => SOURCES,
    import_preview: () => picked(previewOf("reminders", THREE)),
    import_discard: () => null,
  });
  render(<App />);
  await settle();
}

async function goToYourData() {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Your data" }));
  await settle();
}

const sheet = () => screen.queryByRole("dialog", { name: "Import tasks" });

test("your_data_import_opens_board_sheet", async () => {
  await start();
  await goToYourData();
  fireEvent.click(screen.getByRole("button", { name: "Import tasks…" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
  expect(sheet()).toBeInTheDocument();
});

test("palette_import_tasks_opens_sheet", async () => {
  await start();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: /Import tasks…/ }));
  await settle();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
  expect(sheet()).toBeInTheDocument();
});

test("palette_import_is_not_first", async () => {
  await start();
  await emitPaletteOpen();
  const options = screen.getAllByRole("option");
  expect(options[0]).not.toHaveTextContent("Import tasks…");
  expect(options.some((o) => o.textContent?.includes("Import tasks…"))).toBe(true);
});

test("returning_to_board_does_not_reopen_sheet", async () => {
  await start();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: /Import tasks…/ }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await settle();
  expect(sheet()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Board" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
  expect(sheet()).toBeNull();
});
