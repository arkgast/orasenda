import { expect, test } from "vitest";
import { cn } from "./utils";

test("a theme font size and a colour both survive", () => {
  expect(cn("text-body text-ink")).toBe("text-body text-ink");
  expect(cn("text-body-sm text-ink-muted")).toBe("text-body-sm text-ink-muted");
});

test("a later font size replaces an earlier one", () => {
  expect(cn("text-body", "text-title")).toBe("text-title");
});
