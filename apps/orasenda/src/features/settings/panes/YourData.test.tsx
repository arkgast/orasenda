import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, test } from "vitest";
import { YourData } from "./YourData";

test("data_pane_placeholder_has_a_heading_and_the_ref", () => {
  const ref = createRef<HTMLHeadingElement>();
  render(<YourData headingRef={ref} />);
  const heading = screen.getByRole("heading", { level: 2, name: "Your data" });
  expect(ref.current).toBe(heading);
  expect(heading).toHaveAttribute("tabindex", "-1");
  expect(screen.getByText("Coming in the next update.")).toBeInTheDocument();
});
