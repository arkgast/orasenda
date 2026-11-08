import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";

test("placeholder_renders_heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1, name: "Orasenda" })).toBeInTheDocument();
});
