import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 900, height: 600 },
];
const SECTION = "#settings-backups";

/** Controls of the section under 44x44; a radio is hit through its label. */
async function smallControls(page: Page): Promise<string[]> {
  return page.locator(SECTION).evaluate((root) => {
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll("button, input"))) {
      const box = el instanceof HTMLInputElement && el.type === "radio" ? el.closest("label") : el;
      const r = (box ?? el).getBoundingClientRect();
      if (r.width < 44 || r.height < 44)
        out.push(`${el.tagName} ${el.id} is ${r.width}x${r.height}`);
    }
    return out;
  });
}

for (const size of SIZES) {
  for (const scenario of ["backupsEmpty", "backupsTwelve", "backupsUnavailable"]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`settings_backups_fits_${size.width}x${size.height}_${scenario}_${scheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await openApp(page, scenario, size, { page: "settings", pane: "Backups" });
        await expect(page.locator(`${SECTION} table`)).toBeVisible();
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(m.scrollWidth, "no sideways scroll").toBeLessThanOrEqual(m.innerWidth);
        expect(await smallControls(page), "every control is at least 44x44").toEqual([]);
        // The list scrolls with the pane, never in a box of its own.
        const boxed = await page.locator(SECTION).evaluate(
          (root) =>
            Array.from(root.querySelectorAll("*")).filter((el) => {
              const overflow = getComputedStyle(el).overflowY;
              return (
                (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight
              );
            }).length,
        );
        expect(boxed, "no inner scroll box").toBe(0);
      });
    }
  }
}
