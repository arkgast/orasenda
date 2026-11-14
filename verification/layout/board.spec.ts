import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

// Compact (stacked), the default window and a spacious one.
const SIZES = [
  { width: 480, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
] as const;

async function openBoard(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("heading", { name: "Board", level: 1 })).toBeAttached();
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  for (const scenario of ["boardWeek", "boardOver", "boardLong"]) {
    test(`board_${scenario}_never_scrolls_sideways_${at}`, async ({ page }) => {
      await openBoard(page, scenario, size);
      await expect(
        page.getByRole("button", { name: /^Write the intro|^A task title/ }),
      ).toBeVisible();
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        main: (document.querySelector("main") as HTMLElement).scrollWidth,
        mainBox: (document.querySelector("main") as HTMLElement).clientWidth,
      }));
      expect(widths.page).toBeLessThanOrEqual(size.width);
      expect(widths.main).toBeLessThanOrEqual(widths.mainBox);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        size.height,
      );
    });
  }

  test(`board_targets_are_hit_min_${at}`, async ({ page }) => {
    await openBoard(page, "boardWeek", size);
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
  });

  test(`board_focus_ring_is_visible_${at}`, async ({ page }) => {
    await openBoard(page, "boardWeek", size);
    await page.keyboard.press("Tab");
    const card = page.getByRole("button", { name: /^Write the intro/ });
    await card.focus();
    await expectFocusRingVisible(card);
    await page.keyboard.press("Meta+n");
    // Focusing the field scrolls the stacked region back up; the ring is judged once it settles.
    const field = page.getByRole("textbox", { name: "New task" });
    await expect(field).toBeFocused();
    await expect(async () => expectFocusRingVisible(field)).toPass();
  });

  test(`board_empty_and_unreadable_fit_${at}`, async ({ page }) => {
    await openBoard(page, "boardEmpty", size);
    await expect(page.getByText("No tasks yet.")).toBeVisible();
    await openBoard(page, "boardUnreadable", size);
    await expect(page.getByText("The board couldn't be loaded. Try again.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
  });
}

test("board_default_window_opens_three_columns_and_folds_done", async ({ page }) => {
  await openBoard(page, "boardWeek", { width: 900, height: 600 });
  for (const name of ["Backlog", "Today", "Doing"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Done, 2 tasks" })).toBeVisible();
  const widths = await page.evaluate(() =>
    ["backlog", "today", "doing"].map(
      (lane) => document.getElementById(`board-col-${lane}`)?.getBoundingClientRect().width ?? 0,
    ),
  );
  const [backlog, today, doing] = widths as [number, number, number];
  // Today and Doing are the wide centre; Backlog stays a readable list.
  expect(today).toBeGreaterThan(backlog);
  expect(doing).toBeGreaterThan(backlog);
  expect(backlog).toBeGreaterThanOrEqual(200);
});
