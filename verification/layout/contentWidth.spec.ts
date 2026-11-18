import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { smallTargets } from "./support/hitTargets.ts";

type Size = { width: number; height: number };

const PAGES = [
  { name: "Routines", key: "Meta+5", scenario: "routinesOverview", primary: true },
  { name: "Inbox", key: "Meta+2", scenario: "inboxFifty", primary: false },
  { name: "Review", key: "Meta+6", scenario: "reviewOverview", primary: true },
];

async function open(page: Page, p: (typeof PAGES)[number], size: Size) {
  await openApp(page, p.scenario, size);
  await page.keyboard.press(p.key);
  await expect(page.getByRole("heading", { name: p.name, level: 1 })).toBeAttached();
  await expect(page.locator("[data-slot=scroll-region-column]")).toBeAttached();
}

const rects = (page: Page) =>
  page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right } : null;
    };
    const bar = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--scrollbar-size"),
    );
    const column = document.querySelector("[data-slot=scroll-region-column]") as HTMLElement;
    // Review keeps its own space-1 inline padding (review.css), so its first box is the body wrapper.
    const first = (document.querySelector(".app-review-body") ??
      column.querySelector("li, [data-slot=card], article, section")) as HTMLElement;
    const primary = document.querySelector(
      "[data-slot=page-frame-header-column] [data-slot=button][data-variant=primary]",
    );
    return {
      bar,
      H: box("[data-slot=page-frame-header-column]"),
      S: box("[data-slot=page-frame-status-column]"),
      C: box("[data-slot=scroll-region-column]"),
      R: box("[data-slot=scroll-region]"),
      B: box("[data-slot=page-frame-body]"),
      first: first ? first.getBoundingClientRect().right : null,
      primary: primary ? primary.getBoundingClientRect().right : null,
    };
  });

for (const size of [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
]) {
  for (const p of PAGES) {
    test(`content_column_centred_and_header_aligned_${p.name}_${size.width}x${size.height}`, async ({
      page,
    }) => {
      await open(page, p, size);
      const r = await rects(page);
      const { H, S, C, R, B } = r;
      if (!H || !S || !C || !R || !B) throw new Error("missing slot");
      for (const col of [H, S]) {
        expect(Math.abs(col.left - C.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(col.right - C.right)).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(R.right - (B.right - 4))).toBeLessThanOrEqual(1);
      expect(Math.abs(R.left - (B.left + 4))).toBeLessThanOrEqual(1);
      const left = C.left - (R.left + 4);
      const right = R.right - 4 - r.bar - C.right;
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      if (p.primary) {
        expect(r.primary).not.toBeNull();
        expect(Math.abs((r.primary ?? 0) - H.right)).toBeLessThanOrEqual(1);
      }
      if (r.first !== null) expect(Math.abs(r.first - C.right)).toBeLessThanOrEqual(1);
      expect(await smallTargets(page.getByRole("main"))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        size.height,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );
    });
  }
}

for (const p of PAGES) {
  test(`narrow_window_column_fills_region_and_focus_ring_fits_${p.name}`, async ({ page }) => {
    await open(page, p, { width: 640, height: 480 });
    const r = await rects(page);
    const { C, R } = r;
    if (!C || !R) throw new Error("missing slot");
    // 640 is narrower than content-width plus the insets, so the column fills the content box.
    expect(Math.abs(C.left - (R.left + 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(C.right - (R.right - 4 - r.bar))).toBeLessThanOrEqual(1);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const fits = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const region = document.querySelector("[data-slot=scroll-region]") as HTMLElement;
      if (!region.contains(el)) return true;
      const e = el.getBoundingClientRect();
      const g = region.getBoundingClientRect();
      const ring = 4;
      return (
        e.left - ring >= g.left &&
        e.right + ring <= g.right - region.offsetWidth + region.clientWidth
      );
    });
    expect(fits).toBe(true);
  });
}

test("settings_content_centred_in_pane", async ({ page }) => {
  await openApp(page, "settingsInvalid", { width: 1440, height: 900 }, { page: "settings" });
  const g = await page.evaluate(() => {
    const c = document.querySelector(".settings-content")?.getBoundingClientRect();
    const region = document.querySelector("[data-slot=scroll-region]") as HTMLElement;
    const r = region.getBoundingClientRect();
    const cs = getComputedStyle(region);
    const left = r.left + region.clientLeft + Number.parseFloat(cs.paddingLeft);
    const right =
      r.left + region.clientLeft + region.clientWidth - Number.parseFloat(cs.paddingRight);
    return c ? { left: c.left - left, right: right - c.right } : null;
  });
  expect(g).not.toBeNull();
  expect(Math.abs((g?.left ?? 0) - (g?.right ?? 99))).toBeLessThanOrEqual(1);
});
