import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
  { width: 640, height: 480 },
] as const;

async function openSheet(page: Page, size: { width: number; height: number }) {
  await openApp(page, "boardWeek", size);
  await page.keyboard.press("Meta+3");
  const card = page.getByRole("button", { name: /^Write the intro/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Write the intro/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`board_detail_sheet_fits_and_stacks_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    await expect(dialog.getByRole("textbox", { name: "Title" })).toBeFocused();
    const m = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lefts = [...el.querySelectorAll("select")].map((f) =>
        Math.round(f.getBoundingClientRect().left),
      );
      return {
        width: r.width,
        right: r.right,
        bottom: r.bottom,
        columns: new Set(lefts).size,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.right).toBeLessThanOrEqual(size.width);
    expect(m.bottom).toBeLessThanOrEqual(size.height);
    expect(m.sideways).toBeLessThanOrEqual(0);
    // The sheet body is wider than container-sheet-stack at all three sizes.
    expect(m.columns).toBe(2);
  });

  test(`board_detail_sheet_targets_and_focus_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    // A chip's box (14px) sits inside a full-height label, and a tag's remove mark grows its hit area
    // with a pseudo-element; their own specs judge those two. Everything else is hit-min.
    const small = (await smallTargets(dialog)).filter(
      (line) => !line.startsWith('input ""') && !line.includes("Remove tag"),
    );
    expect(small).toEqual([]);
    await expectFocusRingVisible(dialog.getByRole("textbox", { name: "Title" }));
  });

  test(`board_detail_escape_returns_focus_to_the_card_${at}`, async ({ page }) => {
    await openSheet(page, size);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Write the intro/ })).toBeFocused();
  });
}
