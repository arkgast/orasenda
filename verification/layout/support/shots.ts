import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

/** Saves <name>-<project>.png into ORASENDA_SHOTS when it is set. */
export async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = process.env.ORASENDA_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}-${info.project.name}.png`), fullPage: true });
}
