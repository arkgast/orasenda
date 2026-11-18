import { expect, test } from "vitest";
import { checkFixture, fixtures } from "./lint-layers.ts";

const names = fixtures();

test("fixtures exist", () => {
  expect(names.length).toBeGreaterThan(0);
});

// One case per fixture: ".ok" fixtures are clean, the rest must be reported.
test.each(names)("%s behaves as its header says", (name) => {
  expect(checkFixture(name)).toBeNull();
});
