import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZE = { width: 640, height: 480 };
const MARGIN = 8; // space-2

// Every menuitem box, and the panel, sits inside the window: the menu is never cut off or scrolled.
async function expectMenuInView(page: Page, sides?: RegExp) {
  await expect(page.getByRole("menu")).toBeVisible();
  if (sides) await expect(page.getByRole("menu")).toHaveAttribute("data-side", sides);
  const boxes = await page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect().toJSON();
    return {
      panel: box(document.querySelector('[data-slot="popover-menu"]') as Element),
      items: [...document.querySelectorAll('[role^="menuitem"]')].map(box),
      scrolls: (() => {
        const p = document.querySelector('[data-slot="popover-menu"]') as HTMLElement;
        return p.scrollHeight > p.clientHeight;
      })(),
    };
  });
  expect(boxes.items.length).toBeGreaterThan(0);
  for (const b of [boxes.panel, ...boxes.items]) {
    expect(b.top).toBeGreaterThanOrEqual(MARGIN);
    expect(b.left).toBeGreaterThanOrEqual(MARGIN);
    expect(b.bottom).toBeLessThanOrEqual(SIZE.height - MARGIN);
    expect(b.right).toBeLessThanOrEqual(SIZE.width - MARGIN);
  }
  expect(boxes.scrolls).toBe(false);
}

test("popover_menu_board_card_menu_shows_every_item_in_view_640x480", async ({ page }) => {
  await openApp(page, "boardWeek", SIZE);
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("heading", { name: "Board", level: 1 })).toBeAttached();
  await page.getByRole("button", { name: /^Write the intro/ }).focus();
  await page.keyboard.press("Shift+F10");
  await expectMenuInView(page, /^(right|left)$/);
});

test("popover_menu_board_more_actions_shows_every_item_in_view_640x480", async ({ page }) => {
  await openApp(page, "boardWeek", SIZE);
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("heading", { name: "Board", level: 1 })).toBeAttached();
  await page
    .getByRole("button", { name: /^More actions for/ })
    .last()
    .click();
  await expectMenuInView(page, /^(right|left)$/);
});

test("popover_menu_inbox_row_menu_stays_in_view_640x480_regression_guard", async ({ page }) => {
  await openApp(page, "inboxOne", SIZE);
  await page.keyboard.press("Meta+2");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeAttached();
  await page.getByRole("listitem").first().focus();
  await page.keyboard.press("Shift+F10");
  await expectMenuInView(page);
});
