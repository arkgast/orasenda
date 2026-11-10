import { expect, type Page, test } from "@playwright/test";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen, pressTab } from "./support/specimen.ts";

const frame = (page: Page, state: string) =>
  page.locator(`[data-frame][data-state="${state}"] [data-slot=page-frame]`);

const boxes = (page: Page, state: string) =>
  frame(page, state).evaluate((root) => {
    const rect = (slot: string) => {
      const el = root.querySelector(`[data-slot=${slot}]`) as HTMLElement | null;
      return el ? el.getBoundingClientRect() : null;
    };
    const r = root.getBoundingClientRect();
    const cs = getComputedStyle(root);
    return {
      root: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      padTop: Number.parseFloat(cs.paddingTop),
      padSide: Number.parseFloat(cs.paddingLeft),
      padBottom: Number.parseFloat(cs.paddingBottom),
      overflows: root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth,
      header: rect("page-frame-header"),
      status: rect("page-frame-status"),
      body: rect("page-frame-body"),
      footer: rect("page-frame-footer"),
    };
  });

const STATES = ["page-frame-list-900x600", "page-frame-list-1440x900", "page-frame-flow-900x600"];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
]) {
  test(`page_frame_fits_at_${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "PageFrame");
    const wide = viewport.width >= 640;
    for (const state of STATES) {
      const b = await boxes(page, state);
      expect(b.overflows).toBe(false);
      // The header and status row are hit-min (44px) tall; the flow footer is control-lg (52px).
      expect(b.header?.height).toBeGreaterThanOrEqual(44);
      expect(b.header?.height).toBeLessThanOrEqual(44.5);
      expect(b.status?.height).toBeGreaterThanOrEqual(44);
      expect(b.status?.height).toBeLessThanOrEqual(44.5);
      if (state.includes("flow")) {
        expect(b.footer?.height).toBeGreaterThanOrEqual(52);
        expect(b.footer?.height).toBeLessThanOrEqual(52.5);
      } else {
        expect(b.footer).toBeNull();
      }
      // Below sm the padding is space-4 all round; from sm it is space-5 above and space-6 at the sides and below.
      expect(b.padSide).toBe(wide ? 32 : 16);
      expect(b.padTop).toBe(wide ? 24 : 16);
      expect(b.padBottom).toBe(wide ? 32 : 16);
      // The region takes what is left and stays inside the frame.
      expect(b.body?.height).toBeGreaterThan(44);
      expect(b.body?.bottom).toBeLessThanOrEqual(b.root.bottom - b.padBottom + 0.5);
    }
    await shoot(page, info, `page-frame-${viewport.width}x${viewport.height}`);
  });
}

test("page_frame_focus_ring_visible", async ({ page }) => {
  await openSpecimen(page, "PageFrame");
  const count = await page
    .locator("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")
    .count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await pressTab(page);
    const active = page.locator(":focus");
    await expect(active).toHaveCount(1);
    await expectFocusRingVisible(active);
  }
});

test("page_frame_reduced_motion_has_no_motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSpecimen(page, "PageFrame");
  expect(await animatedElements(page)).toEqual([]);
});

test("page_frame_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "PageFrame");
  await expect(
    page.locator('[data-frame][data-state="page-frame-flow-900x600"]'),
  ).toMatchAriaSnapshot(`
    - heading "Weekly review" [level=1]
    - text: Step 2 of 4
  `);
  await expect(
    page.locator('[data-frame][data-state="page-frame-list-1440x900"]'),
  ).toMatchAriaSnapshot(`
    - heading "Board" [level=1]
    - button "Plan the day"
  `);
});
