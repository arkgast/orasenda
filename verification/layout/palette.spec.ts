import { expect, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

// The ⌘K palette in the real App against mockIPC: Rust's `palette-open` event is emitted through
// the mocked event plugin, as the Focus menu's ⌘K would.
const SIZES = [
  { width: 360, height: 240, compact: true },
  { width: 900, height: 600, compact: false },
] as const;

for (const size of SIZES) {
  test(`palette_fits_and_focuses_${size.width}x${size.height}`, async ({ page }) => {
    await openApp(page, "idle", size);
    await page.evaluate(() =>
      (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke(cmd: string, args: unknown): Promise<unknown> };
        }
      ).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "palette-open", payload: null }),
    );
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const search = page.getByRole("combobox");
    await expect(search).toBeFocused();
    await expectFocusRingVisible(search);

    const scroll = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    expect(scroll.w).toBeLessThanOrEqual(size.width);
    expect(scroll.h).toBeLessThanOrEqual(size.height);
    expect(await smallTargets(dialog)).toEqual([]);
    const first = page.getByRole("option").first();
    await expect(first).toContainText("Start focus");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
