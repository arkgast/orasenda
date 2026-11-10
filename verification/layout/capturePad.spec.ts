import { expect, test } from "@playwright/test";
import { smallTargets } from "./support/hitTargets.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

const OPEN = "Open the capture pad";

test("capture_pad_opens_named_with_thought_focused_and_saves_on_escape", async ({ page }, info) => {
  await openSpecimen(page, "CapturePad");
  const opener = page.getByRole("button", { name: OPEN });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Capture a thought" });
  await expect(dialog).toBeVisible();
  const field = page.getByRole("textbox", { name: "Thought" });
  await expect(field).toBeFocused();
  expect(await smallTargets(dialog)).toEqual([]);
  await field.fill("Call the dentist");
  await shoot(page, info, "capture-pad");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved to Inbox.");
  await expect(opener).toBeFocused();
});

test("capture_pad_keeps_text_and_says_so_when_saving_fails", async ({ page }, info) => {
  await openSpecimen(page, "CapturePad");
  await page.getByRole("button", { name: "Open a capture pad that cannot save" }).click();
  await page.getByRole("textbox", { name: "Thought" }).fill("Keep me");
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  await expect(page.getByText("Your note is still here. Try saving again.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Thought" })).toHaveValue("Keep me");
  await shoot(page, info, "capture-pad-error");
});

test("capture_pad_backdrop_click_never_dismisses", async ({ page }) => {
  await openSpecimen(page, "CapturePad");
  await page.getByRole("button", { name: OPEN }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`capture_pad_fits_and_stays_in_range_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "CapturePad");
    await page.getByRole("button", { name: OPEN }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
      };
    });
    expect(box.width).toBeLessThanOrEqual(421);
    expect(box.width).toBeGreaterThanOrEqual(Math.min(340, box.vw - 24 - 1));
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.vw);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.vh);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      box.vw,
    );
    await shoot(page, testInfo, `capture-pad-${viewport.width}x${viewport.height}`);
  });
}
