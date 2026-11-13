import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { pressTab } from "./support/specimen.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 480, height: 320 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
];

// The shell's compact rule: under 640 wide or 480 high there is no rail, only the Pages button.
const isCompact = (size: { width: number; height: number }) =>
  size.width < 640 || size.height < 480;

async function expectNoDocumentScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(m.sh, "the document does not scroll down").toBeLessThanOrEqual(m.ih);
  expect(m.sw, "the document does not scroll across").toBeLessThanOrEqual(m.iw);
}

async function expectTargets(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
    expect(box, `${name} is on the page`).not.toBeNull();
    expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
}

for (const size of SIZES) {
  const label = `${size.width}x${size.height}`;

  test(`app_shell_today_${label}`, async ({ page }) => {
    await openApp(page, "idle", size);
    await expectNoDocumentScroll(page);
    const rail = page.getByRole("navigation", { name: "Main navigation" });
    if (isCompact(size)) await expect(rail).toHaveCount(0);
    else {
      await expect(rail).toBeVisible();
      await expectTargets(page, ["Today", "Board", "Settings"]);
    }
    // Today's own top row (with the Pages button) comes with C4.
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeAttached();
  });

  test(`app_shell_board_${label}`, async ({ page }) => {
    await openApp(page, "idle", size);
    await page.keyboard.press("Meta+2");
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeFocused();
    await expectNoDocumentScroll(page);
    const rail = page.getByRole("navigation", { name: "Main navigation" });
    const pages = page.getByRole("button", { name: "Pages", exact: true });
    if (isCompact(size)) {
      await expect(rail).toHaveCount(0);
      await expect(pages).toBeVisible();
      await expectTargets(page, ["Pages"]);
    } else {
      await expect(rail).toBeVisible();
      await expect(pages).toHaveCount(0);
    }
  });
}

// Each rail item's whole focus ring shows at the window's left edge (the projects cover both themes).
for (const size of [
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
]) {
  test(`rail_focus_ring_visible_${size.width}x${size.height}`, async ({ page }) => {
    await openApp(page, "idle", size);
    await page.mouse.click(1, 1);
    const rail = page.getByRole("navigation", { name: "Main navigation" });
    // The rail is one Tab stop (roving focus): Tab enters it, the arrows visit every item.
    const items = await rail.getByRole("button").count();
    expect(items).toBeGreaterThanOrEqual(3);
    await pressTab(page);
    for (let i = 0; i < items; i++) {
      if (i > 0) await page.keyboard.press("ArrowDown");
      await expect(rail.locator(":focus")).toHaveCount(1);
      await expectFocusRingVisible(page.locator(":focus"));
    }
    await expectNoDocumentScroll(page);
  });
}
