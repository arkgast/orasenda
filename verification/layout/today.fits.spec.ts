import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZE = { width: 900, height: 600 };

/** Today does not scroll the document and Start sits fully inside the window. */
async function expectStartVisible(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const start = Array.from(document.querySelectorAll("button")).find((b) =>
      /Start focus/.test(b.textContent ?? ""),
    );
    const r = start?.getBoundingClientRect();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      bottom: r ? r.bottom : null,
    };
  });
  expect(m.bottom, "Start focus is on the page").not.toBeNull();
  expect(m.scrollHeight, "the document does not scroll").toBeLessThanOrEqual(m.innerHeight);
  expect(m.bottom as number, "Start is inside the window").toBeLessThanOrEqual(m.innerHeight);
}

test("today_start_visible_900x600_idle", async ({ page }) => {
  // Found by this harness: even idle, Start's bottom is 606 and the document is 638 tall at 900x600
  // (the plan expected it to pass). Part of #119; expected to fail until C3 removes test.fail().
  test.fail();
  await openApp(page, "idle", SIZE);
  await expectStartVisible(page);
});

test("today_start_visible_900x600_after_end", async ({ page }) => {
  // #119: the "Session ended." notice pushes Start below the window. Expected to fail until C3.
  test.fail();
  await openApp(page, "ended", SIZE);
  await expectStartVisible(page);
});

test("today_start_visible_900x600_custom_checked", async ({ page }) => {
  // #119: the two Custom minute inputs push Start below the window. Expected to fail until C3.
  test.fail();
  await openApp(page, "customChecked", SIZE);
  await expectStartVisible(page);
});
