import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

async function openReview(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+6");
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeAttached();
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`review_overview_fits_and_scrolls_inside_the_region_${at}`, async ({ page }) => {
    await openReview(page, "reviewOverview", size);
    await expect(page.getByRole("region", { name: "Today" })).toBeAttached();
    await expect(page.getByText("Write notes · Done")).toBeAttached();
    // The page never scrolls sideways or down; the one scrolling box is the Review region.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
    const region = page.getByRole("region", { name: "Review", exact: true });
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The longest priority wraps inside the region instead of widening it.
    const inside = await page.getByText(/^Plan the quarterly roadmap/).evaluate((el, id) => {
      const box = el.getBoundingClientRect();
      const edge = document.querySelector(id)?.getBoundingClientRect();
      return edge ? box.right <= edge.right : false;
    }, '[data-slot="scroll-region"]');
    expect(inside).toBe(true);
  });

  test(`review_overview_targets_and_one_primary_${at}`, async ({ page }) => {
    await openReview(page, "reviewOverview", size);
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
    await expect(page.locator('[data-slot="button"][data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Start shutdown" })).toBeVisible();
  });

  test(`review_empty_${at}`, async ({ page }) => {
    await openReview(page, "reviewEmpty", size);
    await expect(page.getByText("No priorities yet.")).toBeAttached();
    await expect(page.getByRole("list")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
  });

  test(`review_unavailable_${at}`, async ({ page }) => {
    await openReview(page, "reviewUnavailable", size);
    await expect(page.getByText("Orasenda can't load your review right now.")).toBeAttached();
    await expect(page.getByText("It's kept on this Mac.")).toBeAttached();
    await expect(page.getByRole("button", { name: /^Try again/ })).toBeAttached();
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
  });
}

test("review_primary_shows_a_focus_ring", async ({ page }) => {
  await openReview(page, "reviewOverview", { width: 900, height: 600 });
  const primary = page.getByRole("button", { name: "Start shutdown" });
  await primary.focus();
  await expectFocusRingVisible(primary);
  await page.getByRole("button", { name: "Start weekly review" }).focus();
  await expectFocusRingVisible(page.getByRole("button", { name: "Start weekly review" }));
});
