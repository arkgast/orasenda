import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 360, height: 640 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

async function openBoard(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+2");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeAttached();
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`board_empty_fits_${at}`, async ({ page }) => {
    await openBoard(page, "boardEmpty", size);
    await expect(page.getByText("Nothing in your Inbox.")).toBeVisible();
    await expect(page.getByText("⌃⌥N captures a thought from anywhere.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
  });

  test(`board_one_note_targets_${at}`, async ({ page }) => {
    await openBoard(page, "boardOne", size);
    const remove = page.getByRole("button", { name: /^Remove note/ });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test(`board_fifty_notes_scroll_inside_the_region_${at}`, async ({ page }) => {
    await openBoard(page, "boardFifty", size);
    // The page never scrolls; the one scrolling box is the Inbox region.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
    const region = page.getByRole("region", { name: "Inbox" });
    const scrolls = await region.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
    await expect(page.getByRole("button", { name: /^Remove note/ }).first()).toBeVisible();
  });

  test(`board_long_notes_wrap_${at}`, async ({ page }) => {
    await openBoard(page, "boardLong", size);
    const region = page.getByRole("region", { name: "Inbox" });
    // Nothing overflows sideways, so a long word breaks and the focus ring is not clipped.
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test("board_remove_focus_ring_has_room_at_the_inline_end", async ({ page }) => {
  await openBoard(page, "boardFifty", { width: 900, height: 600 });
  const button = page.getByRole("button", { name: /^Remove note/ }).first();
  await button.focus();
  const region = await page.getByRole("region", { name: "Inbox" }).boundingBox();
  const box = await button.boundingBox();
  expect(region && box ? region.x + region.width - (box.x + box.width) : 0).toBeGreaterThanOrEqual(
    4,
  );
});

test("board_unreadable_shows_a_line_not_the_empty_state", async ({ page }) => {
  await openBoard(page, "boardUnreadable", { width: 900, height: 600 });
  await expect(page.getByText("Orasenda can't read your Inbox right now.")).toBeVisible();
  await expect(page.getByText("Nothing in your Inbox.")).toHaveCount(0);
});

test("board_remove_shows_undo", async ({ page }) => {
  await openBoard(page, "boardOne", { width: 900, height: 600 });
  await page.getByRole("button", { name: /^Remove note/ }).click();
  await expect(page.getByText("Note removed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo/ })).toBeVisible();
});
