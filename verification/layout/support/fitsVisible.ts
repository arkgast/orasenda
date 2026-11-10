import { expect, type Locator } from "@playwright/test";
import { overflows } from "./fits.ts";

/** Like expectFits, but ignores the visually hidden `.os-sr-only` text, which is a 1x1 box by design. */
export async function expectVisibleFits(frame: Locator): Promise<void> {
  const reported = await overflows(frame);
  expect(
    reported.filter((line) => !line.includes(".os-sr-only") && !line.includes(".sr-only")),
  ).toEqual([]);
}
