import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { NowLine } from "./now-line";

test("renders_now_with_word_and_time", () => {
  render(<NowLine time="09:41" />);
  expect(screen.getByText("Now · 09:41")).toBeTruthy();
});

test("exposes_group_with_name", () => {
  const { container } = render(<NowLine time="09:41" />);
  const root = container.querySelector("[data-slot=now-line]");
  expect(root?.getAttribute("aria-label")).toBe("Now, 09:41");
});

test("renders_line_and_dot_hidden_from_assistive_tech", () => {
  const { container } = render(<NowLine time="09:41" />);
  const line = container.querySelector("[data-slot=now-line-rule]");
  expect(line?.getAttribute("aria-hidden")).toBe("true");
});
