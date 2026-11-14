import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, test } from "vitest";
import { Backups } from "./Backups";

test("backups_pane_placeholder_has_a_heading_and_the_ref", () => {
  const ref = createRef<HTMLHeadingElement>();
  render(<Backups headingRef={ref} />);
  const heading = screen.getByRole("heading", { level: 2, name: "Backups" });
  expect(ref.current).toBe(heading);
  expect(heading).toHaveAttribute("tabindex", "-1");
  expect(screen.getByText("Coming in the next update.")).toBeInTheDocument();
});
