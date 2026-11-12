import { expect, test } from "@playwright/test";
import { animatedElements } from "./support/motion.ts";
import { openSpecimen } from "./support/specimen.ts";

test("commands_and_capture_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: "Open the command palette" }).click();
  await expect(page.getByRole("dialog", { name: "Commands" })).toMatchAriaSnapshot(`
    - dialog "Commands":
      - heading "Commands"
      - combobox "Search commands"
      - listbox "Commands":
        - option /Start a session Focus on one task Command-Return/
        - option /Pause Command-Period/
        - option /End session Shift-Command-Period/
        - option /Capture a thought Control-Option-C/
      - button "Close"
  `);
  await page.keyboard.press("Escape");

  await openSpecimen(page, "ShortcutRecorder");
  await expect(page.locator('[data-state="shortcut-recorder-conflict"]')).toMatchAriaSnapshot(`
    - button /Start or pause focus from anywhere Command-K Change/
    - paragraph: Orasenda uses ⌘K for Commands. Pick a different one.
    - paragraph: A shortcut needs Command, Control or Option plus a key. Delete turns it off.
  `);

  await openSpecimen(page, "CapturePad");
  await page.getByRole("button", { name: "Open the capture pad" }).click();
  await expect(page.getByRole("dialog", { name: "Capture a thought" })).toMatchAriaSnapshot(`
    - dialog "Capture a thought":
      - heading "Capture a thought"
      - textbox "Thought"
      - paragraph: Esc saves to Inbox and closes. ⌘↩ saves too.
      - group "Interruption source"
      - paragraph: This came from your own mind.
      - button "Save to Inbox"
  `);
});

test("commands_and_capture_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: "Open the command palette" }).click();
  expect(await animatedElements(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await openSpecimen(page, "ShortcutRecorder");
  expect(await animatedElements(page)).toEqual([]);
  await page.locator('[data-state="shortcut-recorder-live"]').getByRole("button").first().hover();
  expect(await animatedElements(page)).toEqual([]);
  await openSpecimen(page, "CapturePad");
  await page.getByRole("button", { name: "Open the capture pad" }).click();
  expect(await animatedElements(page)).toEqual([]);
});
