import { expect, type Locator } from "@playwright/test";

/** The focused element draws an outline or box-shadow, and no ancestor with overflow clips it. */
export async function expectFocusRingVisible(el: Locator): Promise<void> {
  const problem = await el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const outlineWidth = cs.outlineStyle !== "none" ? Number.parseFloat(cs.outlineWidth) : 0;
    const hasShadow = cs.boxShadow !== "none";
    if (!(outlineWidth > 0) && !hasShadow) return "no outline or box-shadow on focus";
    const reach = outlineWidth > 0 ? outlineWidth + Number.parseFloat(cs.outlineOffset || "0") : 0;
    const r = node.getBoundingClientRect();
    const ring = { l: r.left - reach, t: r.top - reach, r: r.right + reach, b: r.bottom + reach };
    for (let p = node.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX === "visible" && o.overflowY === "visible") continue;
      const box = p.getBoundingClientRect();
      if (ring.l < box.left || ring.r > box.right || ring.t < box.top || ring.b > box.bottom) {
        return `the ring is clipped by <${p.tagName.toLowerCase()}> (overflow ${o.overflowX}/${o.overflowY})`;
      }
    }
    return "";
  });
  expect(problem).toBe("");
}
