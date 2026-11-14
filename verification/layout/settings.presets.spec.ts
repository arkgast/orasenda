import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

/** Radios and checkboxes are hit through their label, so the label's box counts. */
async function expectTargets(page: Page): Promise<void> {
  const small = await page.locator("[data-slot=scroll-region]").evaluate((root) => {
    const out: string[] = [];
    const sel = "button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
    for (const el of Array.from(root.querySelectorAll(sel))) {
      const wrap =
        el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")
          ? el.closest("label")
          : null;
      const r = (wrap ?? el).getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        out.push(
          `${el.tagName} "${el.getAttribute("aria-label") ?? el.id}" ${r.width}x${r.height}`,
        );
      }
    }
    return out;
  });
  expect(small, "every control is at least 44x44").toEqual([]);
}

/** The table stays inside the scroll region: no sideways scroll, and every Remove is within it. */
async function expectTableInRegion(page: Page): Promise<void> {
  const m = await page.locator("[data-slot=scroll-region]").evaluate((region) => {
    const r = region.getBoundingClientRect();
    const t = region.querySelector("[data-slot=data-table]")?.getBoundingClientRect();
    const outside = Array.from(region.querySelectorAll("button[aria-label^='Remove ']"))
      .filter((b) => b.getBoundingClientRect().right > r.right + 0.5)
      .map((b) => b.getAttribute("aria-label"));
    return {
      over: region.scrollWidth - region.clientWidth,
      tableRight: t ? t.right - r.right : 0,
      outside,
    };
  });
  expect(m.over, "region does not scroll sideways").toBeLessThanOrEqual(0);
  expect(m.tableRight, "table inside the region").toBeLessThanOrEqual(0.5);
  expect(m.outside, "Remove buttons inside the region").toEqual([]);
}

async function expectNoDocumentScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    w: document.documentElement.scrollWidth,
    ih: window.innerHeight,
    iw: window.innerWidth,
  }));
  expect(m.h, "no document scroll").toBeLessThanOrEqual(m.ih);
  expect(m.w, "no sideways scroll").toBeLessThanOrEqual(m.iw);
}

// The Playwright projects run each test in light, dark and light with reduced motion.
for (const size of SIZES) {
  {
    const at = `${size.width}x${size.height}`;

    test(`presets_editor_open_${at}`, async ({ page }) => {
      await openApp(page, "idle", size, { page: "settings", pane: "Timer" });
      const edit = page.getByRole("button", { name: "Edit Steady Focus" });
      await edit.click();
      await expect(page.getByLabel("Long break after")).toBeVisible();
      // Centred first: a control scrolled flush to the region's edge would clip its ring.
      await page.getByLabel("Name").focus();
      await page.getByLabel("Name").evaluate((n) => n.scrollIntoView({ block: "center" }));
      await expectFocusRingVisible(page.getByLabel("Name"));
      await expectNoDocumentScroll(page);
      await expectTargets(page);
    });

    test(`preset_headers_whole_words_${at}`, async ({ page }) => {
      await openApp(page, "presetsOne", size, { page: "settings", pane: "Timer" });
      if (size.width < 640) return; // compact keeps in-word breaks until the owner rules
      const tall = await page.locator("[data-slot=data-table] thead th").evaluateAll((ths) =>
        ths
          .filter((t) => {
            const range = document.createRange();
            range.selectNodeContents(t.firstChild ?? t);
            if (t.querySelector(".sr-only")) return false;
            const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
            return tops.size > 1;
          })
          .map((t) => t.textContent),
      );
      expect(tall, "each header is one line").toEqual([]);
    });

    test(`presets_one_${at}`, async ({ page }) => {
      await openApp(page, "presetsOne", size, { page: "settings", pane: "Timer" });
      await expect(page.getByRole("button", { name: /^Remove / })).toBeDisabled();
      await expect(page.getByText("At least one preset stays.")).toBeVisible();
      await expectNoDocumentScroll(page);
      await expectTableInRegion(page);
      await expectTargets(page);
    });

    test(`twelve_presets_fit_${at}`, async ({ page }) => {
      await openApp(page, "presetsTwelve", size, { page: "settings", pane: "Timer" });
      const add = page.getByRole("button", { name: "Add preset" });
      await add.scrollIntoViewIfNeeded();
      await expect(add).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("Up to 12 presets.")).toBeVisible();
      const remove = page.getByRole("button", { name: "Remove Study block 1" });
      await remove.focus();
      await remove.evaluate((n) => n.scrollIntoView({ block: "center" }));
      await expectFocusRingVisible(remove);
      await expectNoDocumentScroll(page);
      await expectTableInRegion(page);
      await expectTargets(page);
    });
  }
}
