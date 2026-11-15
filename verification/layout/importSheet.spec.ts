import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

const SIZES = [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
  { width: 640, height: 480 },
];

for (const size of SIZES) {
  test(`import_sheet_fits_at_${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openSpecimen(page, "ImportPreviewList");
    await page.getByRole("button", { name: "Open the import sheet" }).click();
    const dialog = page.getByRole("dialog", { name: "Import tasks from Reminders" });
    await expect(dialog).toBeVisible();
    const m = await dialog.evaluate((el) => {
      const body = el.querySelector("[data-slot=dialog-sheet-body]") as HTMLElement;
      const title = el.querySelector("[data-slot=dialog-title]") as HTMLElement;
      const actions = el.querySelector("[data-slot=dialog-actions]") as HTMLElement;
      const hitMin = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--hit-min"),
      );
      const rows = [...el.querySelectorAll("[data-slot=choice]")].map(
        (r) => r.getBoundingClientRect().height,
      );
      const before = {
        title: title.getBoundingClientRect().top,
        actions: actions.getBoundingClientRect().bottom,
      };
      body.scrollTop = body.scrollHeight;
      const after = {
        title: title.getBoundingClientRect().top,
        actions: actions.getBoundingClientRect().bottom,
      };
      const box = el.getBoundingClientRect();
      return {
        // The specimen page scrolls behind the scrim; the sheet itself must sit inside the window.
        overflow: Math.max(box.bottom - window.innerHeight, -box.top, 0),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        listScrolls: body.scrollHeight > body.clientHeight,
        scrolled: body.scrollTop > 0,
        pinned: before.title === after.title && before.actions === after.actions,
        actionsInside: actions.getBoundingClientRect().bottom <= box.bottom + 0.5,
        minRow: Math.min(...rows),
        hitMin,
      };
    });
    expect(m.overflow).toBeLessThanOrEqual(0.5);
    expect(m.sideways).toBeLessThanOrEqual(0);
    expect(m.listScrolls).toBe(true);
    expect(m.scrolled).toBe(true);
    expect(m.pinned).toBe(true);
    expect(m.actionsInside).toBe(true);
    expect(m.minRow).toBeGreaterThanOrEqual(m.hitMin - 0.5);

    // The list is one tab stop; arrow keys move focus and the focused box shows a ring.
    await dialog.getByRole("checkbox").first().focus();
    await page.keyboard.press("ArrowDown");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        checkbox: el.getAttribute("type"),
        width: Number.parseFloat(cs.outlineWidth),
        style: cs.outlineStyle,
      };
    });
    expect(ring.checkbox).toBe("checkbox");
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);
  });
}
