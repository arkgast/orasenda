import { mockBackend, settle } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { App } from "./App";

beforeEach(() => stubPaletteDom());
afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("the_rail_opens_the_routines_page_in_place_of_the_placeholder", async () => {
  mockBackend();
  render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Routines" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toHaveFocus();
  expect(screen.queryByText("This comes in a later phase.")).toBeNull();
  expect(screen.getByRole("article", { name: "Morning Light & Movement" })).toBeInTheDocument();
});
