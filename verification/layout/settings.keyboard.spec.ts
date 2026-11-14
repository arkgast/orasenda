import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 480, height: 320 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

const SECTION = "#settings-keyboard";

/** Controls of the section under 44x44; a checkbox is hit through its label. */
async function smallControls(page: Page): Promise<string[]> {
  return page.locator(SECTION).evaluate((root) => {
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll("button, input"))) {
      const box = el instanceof HTMLInputElement ? el.closest("label") : el;
      const r = (box ?? el).getBoundingClientRect();
      if (r.width < 44 || r.height < 44)
        out.push(`${el.tagName} ${el.id} is ${r.width}x${r.height}`);
    }
    return out;
  });
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  for (const scenario of ["idle", "keyboardLongest", "keyboardFresh", "keyboardSingleOff"]) {
    test(`settings_keyboard_fits_${at}_${scenario}`, async ({ page }) => {
      await openApp(page, scenario, size, { page: "settings", pane: "Shortcuts" });
      const heading = page.locator("#settings-keyboard-heading");
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await page.locator(`${SECTION} table`).scrollIntoViewIfNeeded();

      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }));
      expect(m.scrollWidth, "no sideways scroll").toBeLessThanOrEqual(m.innerWidth);
      expect(m.scrollHeight, "no document scroll").toBeLessThanOrEqual(m.innerHeight);
      expect(await smallControls(page), "every control is at least 44x44").toEqual([]);

      const widths = await page
        .locator(`${SECTION} [data-slot=shortcut-recorder-field]`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
      const field = Number.parseFloat(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--field-width"),
        ),
      );
      // Two actions, two slots each.
      expect(widths).toHaveLength(4);
      for (const width of widths)
        expect(width, "the recorder is at least field-width").toBeGreaterThanOrEqual(field);

      // No row text spills out of the section.
      const spill = await page.locator(SECTION).evaluate((root) => {
        const box = root.getBoundingClientRect();
        return Array.from(root.querySelectorAll("*")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
        }).length;
      });
      expect(spill, "nothing sticks out of the section").toBe(0);
    });
  }
}

for (const size of SIZES) {
  test(`settings_keyboard_warning_fits_${size.width}x${size.height}`, async ({ page }) => {
    await openApp(page, "keyboardWarning", size, { page: "settings", pane: "Shortcuts" });
    const field = page.locator("#keyboard-startPause-app-field");
    await field.scrollIntoViewIfNeeded();
    await field.click();
    await expect(field).toHaveAttribute("data-recording", "true");
    await field.press("Control+u");
    const pick = page.getByRole("button", { name: "Pick another" });
    await expect(pick).toBeVisible();
    await expect(pick).toBeFocused();
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(m.scrollWidth, "no sideways scroll").toBeLessThanOrEqual(m.innerWidth);
    expect(await smallControls(page), "every control is at least 44x44").toEqual([]);
    const use = page.getByRole("button", { name: "Use anyway" });
    await expect(use).toBeVisible();
    const a = await pick.boundingBox();
    const b = await use.boundingBox();
    const overlap =
      a &&
      b &&
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(overlap, "the two choices do not overlap").toBeFalsy();
  });
}

test("settings_keyboard_lines_are_words", async ({ page }) => {
  await openApp(page, "keyboardLongest", SIZES[2], { page: "settings", pane: "Shortcuts" });
  await expect(
    page.getByText("Another app uses this shortcut. Pick a different one."),
  ).toBeVisible();
  await expect(page.getByText(/VoiceOver uses Control-Option keys/)).toHaveCount(1);
});

test("settings_keyboard_fresh_shows_the_command_voiceover_line", async ({ page }) => {
  await openApp(page, "keyboardFresh", SIZES[2], { page: "settings", pane: "Shortcuts" });
  await expect(
    page.getByText("VoiceOver uses this key while it's on. Pick another to use both."),
  ).toHaveCount(2);
});
