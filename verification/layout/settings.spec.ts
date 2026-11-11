import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

/**
 * Controls under 44x44. A native radio or checkbox is hit through its label (Choice, SettingsRow),
 * so that label's box counts; every other control counts by its own box.
 */
async function smallControls(page: Page): Promise<string[]> {
  return page.locator("main").evaluate((root) => {
    const out: string[] = [];
    const sel =
      "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    for (const el of Array.from(root.querySelectorAll(sel))) {
      const own = el.getBoundingClientRect();
      const wrap =
        el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")
          ? el.closest("label")
          : null;
      const r = wrap ? wrap.getBoundingClientRect() : own;
      if (r.width < 44 || r.height < 44) {
        out.push(
          `${el.tagName.toLowerCase()} "${el.getAttribute("aria-label") ?? el.id}" is ${r.width}x${r.height}`,
        );
      }
    }
    return out;
  });
}

async function expectSettingsFit(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const row = document.querySelector("[data-slot=page-frame-status]")?.getBoundingClientRect();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      row: row ? row.height : null,
    };
  });
  expect(m.scrollHeight, "no document scroll").toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth, "no sideways scroll").toBeLessThanOrEqual(m.innerWidth);
  const hit = Number.parseFloat(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--hit-min"),
    ),
  );
  expect(hit).toBe(44);
  expect(m.row, "the status row is 44px").toBe(44);
  expect(await smallControls(page), "every control is at least 44x44").toEqual([]);
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`settings_fits_${at}_longest_save_line`, async ({ page }) => {
    await openApp(page, "settingsInvalid", size, { page: "settings" });
    await page.getByLabel("Focus minutes").fill("3");
    await page.getByLabel("Break minutes").fill("70");
    await page.getByLabel("Break minutes").blur();
    const line = page.getByText("Focus and break minutes weren't saved. Still using 45 and 10.");
    await expect(line).toBeVisible();
    await expect(page.getByRole("button", { name: "Show focus minutes" })).toBeVisible();
    await expectSettingsFit(page);
  });

  test(`settings_fits_${at}_notifications_denied_line`, async ({ page }) => {
    await openApp(page, "notificationsDenied", size, { page: "settings" });
    await expect(
      page.getByText(/On here, but macOS has notifications off for Orasenda/),
    ).toBeVisible();
    await expectSettingsFit(page);
  });
}
