import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { SIZES } from "./support/today.ts";

async function openInbox(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+2");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeAttached();
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`inbox_empty_fits_${at}`, async ({ page }) => {
    await openInbox(page, "inboxEmpty", size);
    await expect(page.getByText("Nothing in your Inbox.")).toBeVisible();
    await expect(page.getByText("⌃⌥N captures a thought from anywhere.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
  });

  test(`inbox_one_note_targets_${at}`, async ({ page }) => {
    await openInbox(page, "inboxOne", size);
    const remove = page.getByRole("button", { name: /^More actions for/ });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test(`inbox_fifty_notes_targets_${at}`, async ({ page }) => {
    await openInbox(page, "inboxFifty", size);
    const box = await page
      .getByRole("button", { name: /^More actions for/ })
      .first()
      .boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test(`inbox_fifty_notes_scroll_inside_the_region_${at}`, async ({ page }) => {
    await openInbox(page, "inboxFifty", size);
    // The page never scrolls; the one scrolling box is the Inbox region.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height,
    );
    const region = page.getByRole("region", { name: "Inbox" });
    const scrolls = await region.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
    await expect(page.getByRole("button", { name: /^More actions for/ }).first()).toBeVisible();
  });

  test(`inbox_long_notes_wrap_${at}`, async ({ page }) => {
    await openInbox(page, "inboxLong", size);
    const region = page.getByRole("region", { name: "Inbox" });
    // Nothing overflows sideways, so a long word breaks and the focus ring is not clipped.
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The region stays inside the window and the text starts inside the region.
    const inside = await region.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const text = el.querySelector("p")?.getBoundingClientRect();
      return {
        region: r.left >= 0 && r.right <= window.innerWidth,
        text: text ? text.left >= r.left : false,
      };
    });
    expect(inside).toEqual({ region: true, text: true });
  });
}

test("inbox_row_menu_focus_ring_has_room_at_the_inline_end", async ({ page }) => {
  await openInbox(page, "inboxFifty", { width: 900, height: 600 });
  const button = page.getByRole("button", { name: /^More actions for/ }).first();
  await button.focus();
  const edge = await page
    .getByRole("region", { name: "Inbox" })
    .evaluate((el) => el.getBoundingClientRect().left + el.clientLeft + el.clientWidth);
  const box = await button.boundingBox();
  expect(box ? edge - (box.x + box.width) : 0).toBeGreaterThanOrEqual(4);
});

test("inbox_unreadable_shows_a_line_not_the_empty_state", async ({ page }) => {
  await openInbox(page, "inboxUnreadable", { width: 900, height: 600 });
  await expect(page.getByText("Orasenda can't read your Inbox right now.")).toBeVisible();
  await expect(page.getByText("Nothing in your Inbox.")).toHaveCount(0);
});

test("inbox_remove_shows_undo", async ({ page }) => {
  await openInbox(page, "inboxOne", { width: 900, height: 600 });
  await page.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(page.getByText("Note removed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo/ })).toBeVisible();
});

test("inbox_moved_status_line_fits_at_360", async ({ page }) => {
  const size = { width: 360, height: 240 };
  await openInbox(page, "inboxOne", size);
  await page.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Move to Board" }).click();
  const moved = page.getByText("Moved to Board");
  await expect(moved).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Board/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    size.width,
  );
  const row = page.getByRole("button", { name: /Undo/ }).locator("xpath=ancestor::*[self::div][1]");
  const box = await row.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("inbox_tab_from_row_leaves_the_list", async ({ page }) => {
  await openInbox(page, "inboxFifty", { width: 900, height: 600 });
  await page.getByRole("listitem").first().focus();
  await page.keyboard.press("Tab");
  // The row is the last tab stop on the page, so focus leaves the document body-ward; it never lands in the list.
  const inList = await page.evaluate(() => document.activeElement?.closest("ul") != null);
  expect(inList).toBe(false);
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  expect(tag === "BODY" || tag === "HTML").toBe(true);
});

test("inbox_shift_f10_opens_the_row_menu_and_esc_returns_to_the_row", async ({ page }) => {
  await openInbox(page, "inboxOne", { width: 900, height: 600 });
  const row = page.getByRole("listitem").first();
  await row.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Move to Board" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
});
