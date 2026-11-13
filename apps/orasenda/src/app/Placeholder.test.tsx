import { mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Placeholder } from "./Placeholder";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("placeholder_compact_shows_pages", () => {
  mockBackend();
  const { container } = render(
    <Placeholder title="Board" compact current="board" onNavigate={() => {}} />,
  );
  const row = container.querySelector(".placeholder-top");
  const button = screen.getByRole("button", { name: "Pages" });
  expect(row).toContainElement(button);
  expect(row?.compareDocumentPosition(screen.getByRole("heading", { level: 2 }))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
});

test("placeholder_regular_has_no_pages_button", () => {
  mockBackend();
  render(<Placeholder title="Board" compact={false} current="board" onNavigate={() => {}} />);
  expect(screen.queryByRole("button", { name: "Pages" })).toBeNull();
});
