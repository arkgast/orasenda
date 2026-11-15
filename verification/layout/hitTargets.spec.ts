import { expect, type Page, test } from "@playwright/test";
import { smallTargets } from "./support/hitTargets.ts";

const MIN = { width: 44, height: 44 };

// A fixture, not the app: the three ways a control gets its hit size from something other than its own box.
async function fixture(page: Page, body: string) {
  await page.setContent(
    `<style>
      label.big { display: grid; width: 44px; height: 44px; place-items: center; }
      label.tiny { display: block; width: 20px; height: 20px; }
      input.box { width: 16px; height: 16px; margin: 0; }
      button.mark { position: relative; width: 14px; height: 14px; padding: 0; }
      button.mark::before { content: ""; position: absolute; top: 50%; left: 50%;
        width: 44px; height: 44px; transform: translate(-50%, -50%); }
      button.flat::before { content: ""; width: 44px; height: 44px; }
    </style><div id="scope">${body}</div>`,
  );
  return page.locator("#scope");
}

test("label_wrapped_checkbox_counts_its_label", async ({ page }) => {
  const scope = await fixture(
    page,
    `<label class="big"><input class="box" type="checkbox" aria-label="Pick three"></label>`,
  );
  expect(await smallTargets(scope, MIN)).toEqual([]);
  const tiny = await fixture(
    page,
    `<label class="tiny"><input class="box" type="checkbox" aria-label="Too small"></label>`,
  );
  expect(await smallTargets(tiny, MIN)).toEqual([expect.stringContaining('"Too small" is 20x20')]);
});

test("for_linked_checkbox_counts_its_label", async ({ page }) => {
  const scope = await fixture(
    page,
    `<label class="big" for="a">Pick three</label><input class="box" id="a" type="checkbox">
     <label class="big" for="r"></label><input class="box" id="r" type="radio" name="k">`,
  );
  expect(await smallTargets(scope, MIN)).toEqual([]);
  const tiny = await fixture(
    page,
    `<label class="tiny" for="b">x</label><input class="box" id="b" type="checkbox" aria-label="Alone">`,
  );
  expect(await smallTargets(tiny, MIN)).toHaveLength(1);
});

test("before_hit_area_counts", async ({ page }) => {
  const scope = await fixture(page, `<button class="mark" aria-label="Remove tag a"></button>`);
  expect(await smallTargets(scope, MIN)).toEqual([]);
  // A pseudo-element that is not positioned out of flow gives no hit area.
  const flat = await fixture(
    page,
    `<button class="flat" style="width:14px;height:14px;padding:0" aria-label="Plain"></button>`,
  );
  expect(await smallTargets(flat, MIN)).toHaveLength(1);
});
