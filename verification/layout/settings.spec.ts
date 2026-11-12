import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];
const COMPACT = [
  { width: 360, height: 240 },
  { width: 480, height: 320 },
];

/**
 * Controls under 44x44. A native radio or checkbox is hit through its label (Choice, SettingsRow),
 * so that label's box counts; every other control counts by its own box.
 */
async function smallControls(page: Page): Promise<string[]> {
  return page.locator("body").evaluate((root) => {
    const out: string[] = [];
    const sel =
      "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    for (const el of Array.from(root.querySelectorAll(sel))) {
      const own = el.getBoundingClientRect();
      const wrap =
        el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")
          ? el.closest("label")
          : null;
      const r = wrap ? wrap.getBoundingClientRect() : own;
      if (r.width < 44 || r.height < 44) {
        out.push(
          `${el.tagName.toLowerCase()} "${el.getAttribute("aria-label") ?? el.id}" is ${r.width}x${r.height}`,
        );
      }
    }
    return out;
  });
}

async function expectSettingsFit(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const row = document.querySelector("[data-slot=page-frame-status]")?.getBoundingClientRect();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      row: row ? row.height : null,
    };
  });
  expect(m.scrollHeight, "no document scroll").toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth, "no sideways scroll").toBeLessThanOrEqual(m.innerWidth);
  const hit = Number.parseFloat(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--hit-min"),
    ),
  );
  expect(hit).toBe(44);
  expect(m.row, "the status row is 44px").toBe(44);
  expect(await smallControls(page), "every control is at least 44x44").toEqual([]);
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`settings_fits_${at}_longest_save_line`, async ({ page }) => {
    await openApp(page, "settingsInvalid", size, { page: "settings" });
    await page.getByRole("radio", { name: /^Deep Work/ }).click();
    const line = page.getByText("Preset wasn't saved. Back to Steady Focus.");
    await expect(line).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again saving preset" })).toBeVisible();
    await expectSettingsFit(page);
  });

  test(`settings_fits_${at}_notifications_denied_line`, async ({ page }) => {
    await openApp(page, "notificationsDenied", size, { page: "settings" });
    await expect(
      page.getByText(/On here, but macOS has notifications off for Orasenda/),
    ).toBeVisible();
    await expectSettingsFit(page);
  });
}

const REGION = "[data-slot=scroll-region]";
const TAB_STOPS =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Every control in the scroll region (a radio group is one stop) is reached by Tab and is in view. */
async function expectTabReach(page: Page): Promise<void> {
  const expected = await page.evaluate(
    ([region, stops]) => {
      const keys = new Set<string>();
      for (const el of Array.from(document.querySelector(region)?.querySelectorAll(stops) ?? [])) {
        keys.add(
          el instanceof HTMLInputElement && el.type === "radio"
            ? `radio:${el.name}`
            : `${el.tagName}#${el.id}|${el.getAttribute("aria-label") ?? ""}`,
        );
      }
      return Array.from(keys);
    },
    [REGION, TAB_STOPS],
  );
  expect(expected.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Jump to section" }).focus();
  const seen = new Set<string>();
  const trail: string[] = [];
  for (let i = 0; i < expected.length * 3 + 4; i++) {
    // WebKit skips radios and checkboxes on a plain Tab (Safari default); Alt+Tab visits every control.
    await page.keyboard.press("Alt+Tab");
    const at = await page.evaluate((region) => {
      const el = document.activeElement;
      const box = document.querySelector(region);
      const r = el?.getBoundingClientRect();
      const b = box?.getBoundingClientRect();
      const key =
        el instanceof HTMLInputElement && el.type === "radio"
          ? `radio:${el.name}`
          : `${el?.tagName}#${el?.id}|${el?.getAttribute("aria-label") ?? ""}`;
      return {
        inside: Boolean(box && el && box.contains(el)),
        visible: Boolean(r && b && r.bottom > b.top && r.top < b.bottom),
        key,
      };
    }, REGION);
    trail.push(`${at.inside ? "in" : "out"}:${at.key}`);
    if (at.inside) {
      expect(at.visible, `${at.key} is scrolled into the region`).toBe(true);
      seen.add(at.key);
    }
  }
  expect(
    expected.filter((key) => !seen.has(key)),
    `controls Tab never reached; trail ${trail.join(" > ")}`,
  ).toEqual([]);
}

for (const size of COMPACT) {
  const at = `${size.width}x${size.height}`;

  test(`settings_fits_${at}`, async ({ page }) => {
    await openApp(page, "settingsInvalid", size, { page: "settings" });
    await expect(page.getByRole("button", { name: "Pages" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump to section" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toHaveCount(0);
    await expectSettingsFit(page);
    const region = await page
      .getByRole("region", { name: "Settings" })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(region, "the scroll region is at least 96px tall").toBeGreaterThanOrEqual(96);
    await expectTabReach(page);
  });

  test(`settings_fits_${at}_longest_save_line`, async ({ page }) => {
    await openApp(page, "settingsInvalid", size, { page: "settings" });
    await page.getByRole("radio", { name: /^Deep Work/ }).click();
    await expect(page.getByText("Preset wasn't saved. Back to Steady Focus.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again saving preset" })).toBeVisible();
    await expectSettingsFit(page);
  });

  test(`settings_fits_${at}_notifications_denied_line`, async ({ page }) => {
    await openApp(page, "notificationsDenied", size, { page: "settings" });
    await expect(
      page.getByText(/On here, but macOS has notifications off for Orasenda/),
    ).toBeVisible();
    await expectSettingsFit(page);
  });
}
