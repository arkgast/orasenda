import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 480, height: 320 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

const NAV = "nav[aria-label=Settings]";
const REGION = "[data-slot=scroll-region]";

async function navBox(page: Page) {
  return page.locator(NAV).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`settings_panes_nav_stays_in_view_${at}`, async ({ page }) => {
    // Twelve presets: the Timer pane is the longest one and has to scroll.
    await openApp(page, "presetsTwelve", size, { page: "settings", pane: "Timer" });
    const before = await navBox(page);
    const region = page.locator(REGION);
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await region.evaluate((el) => el.scrollTop), "the pane scrolls").toBeGreaterThan(0);
    const after = await navBox(page);
    expect(after, "the nav does not move when the pane scrolls").toEqual(before);
    expect(after.top).toBeGreaterThanOrEqual(0);
    expect(after.bottom).toBeLessThanOrEqual(size.height);
    const m = await page.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      w: document.documentElement.scrollWidth,
    }));
    expect(m.h, "no document scroll").toBeLessThanOrEqual(size.height);
    expect(m.w, "no sideways scroll").toBeLessThanOrEqual(size.width);
  });

  test(`settings_panes_every_pane_opens_alone_${at}`, async ({ page }) => {
    await openApp(page, "idle", size, { page: "settings" });
    const names = [
      "General",
      "Timer",
      "Notifications",
      "Shortcuts",
      "About",
      "Your data",
      "Backups",
    ];
    for (const name of names) {
      const nav = page.locator(NAV);
      await nav.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(name);
      await expect(nav.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(await page.locator(REGION).evaluate((el) => el.scrollTop)).toBe(0);
    }
  });

  test(`settings_panes_nav_targets_are_44_${at}`, async ({ page }) => {
    await openApp(page, "idle", size, { page: "settings" });
    const small = await page.locator(`${NAV} button`).evaluateAll((buttons) =>
      buttons
        .filter((el) => el.getAttribute("aria-hidden") !== "true")
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.textContent || el.getAttribute("aria-label"), w: r.width, h: r.height };
        })
        .filter((b) => b.w < 44 || b.h < 44),
    );
    expect(small).toEqual([]);
  });
}

test("settings_panes_compact_strip_scrolls_with_edge_buttons", async ({ page }) => {
  await openApp(page, "idle", SIZES[0], { page: "settings" });
  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-orientation", "horizontal");
  const more = nav.getByRole("button", { name: "More panes" });
  await expect(more).toBeVisible();
  expect(await more.getAttribute("tabindex")).toBe("-1");
  await more.click();
  await expect(nav.getByRole("button", { name: "Earlier panes" })).toBeVisible();
});

test("settings_panes_keyboard_pick_moves_focus_to_the_heading", async ({ page }) => {
  await openApp(page, "idle", SIZES[2], { page: "settings" });
  const timer = page.locator(NAV).getByRole("button", { name: "Timer", exact: true });
  await timer.focus();
  await expectFocusRingVisible(timer);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Timer" })).toBeFocused();
});

test("settings_panes_pointer_pick_keeps_focus_on_the_nav_item", async ({ page }) => {
  await openApp(page, "idle", SIZES[2], { page: "settings" });
  const item = page.locator(NAV).getByRole("button", { name: "Notifications", exact: true });
  await item.click();
  await expect(item).toBeFocused();
});

for (const size of [
  { width: 640, height: 480 },
  { width: 900, height: 480 },
]) {
  test(`settings_panes_last_nav_item_stays_inside_the_body_${size.width}x${size.height}`, async ({
    page,
  }) => {
    await openApp(page, "idle", size, { page: "settings" });
    const last = page.locator(NAV).getByRole("button", { name: "Backups", exact: true });
    await last.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const body = page.locator("[data-slot=page-frame-body]");
    const box = await body.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, scrollTop: el.scrollTop };
    });
    const item = await last.boundingBox();
    expect(item, "Backups is laid out").not.toBeNull();
    expect((item?.y ?? 0) + (item?.height ?? 0)).toBeLessThanOrEqual(box.bottom);
    expect(box.scrollTop, "the page body does not scroll").toBe(0);
  });
}

test("settings_panes_title_stays_while_the_rows_scroll", async ({ page }) => {
  await openApp(
    page,
    "presetsTwelve",
    { width: 900, height: 600 },
    {
      page: "settings",
      pane: "Timer",
    },
  );
  const heading = page.getByRole("heading", { level: 2, name: "Timer", exact: true });
  const before = await heading.boundingBox();
  await page.locator(REGION).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const after = await heading.boundingBox();
  expect(after?.y).toBe(before?.y);
});

test("settings_panes_focus_scrolled_into_view_clears_the_title_360x240", async ({ page }) => {
  await openApp(
    page,
    "presetsTwelve",
    { width: 360, height: 240 },
    { page: "settings", pane: "Timer" },
  );
  const heading = page.getByRole("heading", { level: 2, name: "Timer", exact: true });
  await page.locator(REGION).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.locator("#longest-focus").focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Alt+Shift+Tab");
    const inside = await page.evaluate(
      (region) => Boolean(document.querySelector(region)?.contains(document.activeElement)),
      REGION,
    );
    if (!inside) continue;
    await expect
      .poll(async () => {
        const h = await heading.boundingBox();
        const r = await page.locator(REGION).boundingBox();
        const top = await page.evaluate(
          () => document.activeElement?.getBoundingClientRect().top ?? 0,
        );
        return top - Math.max((h?.y ?? 0) + (h?.height ?? 0), r?.y ?? 0);
      })
      .toBeGreaterThanOrEqual(0);
  }
});
