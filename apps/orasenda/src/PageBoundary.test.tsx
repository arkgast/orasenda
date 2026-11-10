import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PageBoundary } from "./PageBoundary";

function Broken(): never {
  throw new Error("chunk failed to load");
}

test("page_boundary_shows_a_calm_fallback_when_a_page_fails", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <PageBoundary>
      <Broken />
    </PageBoundary>,
  );
  expect(screen.getByText("This page did not load.")).toBeInTheDocument();
  expect(screen.getByText(/Close Orasenda and open it again/)).toBeInTheDocument();
  log.mockRestore();
});

test("page_boundary_renders_its_children_when_nothing_fails", () => {
  render(
    <PageBoundary>
      <p>Fine</p>
    </PageBoundary>,
  );
  expect(screen.getByText("Fine")).toBeInTheDocument();
});
