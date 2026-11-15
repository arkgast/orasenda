import type { Locator } from "@playwright/test";

const FOCUSABLE =
  "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

/** Focusables in scope smaller than min (default: the computed --hit-min in both dimensions). */
export async function smallTargets(
  scope: Locator,
  min?: { width: number; height: number },
): Promise<string[]> {
  return scope.evaluate(
    (root, args) => {
      let { width, height } = args.min ?? { width: 0, height: 0 };
      if (!args.min) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--hit-min").trim();
        const px = Number.parseFloat(raw);
        if (!Number.isFinite(px)) throw new Error(`--hit-min is "${raw}", not a pixel size`);
        width = height = px;
      }
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll(args.selector))) {
        // A control is as big as the largest whole box it can get its hit size from: its own box,
        // the label of a checkbox or radio, or a positioned ::before. Boxes are compared whole,
        // never width from one and height from another.
        const own = el.getBoundingClientRect();
        let w = own.width;
        let h = own.height;
        // Passes when ANY whole box meets both minimums. For the message, keep the largest box.
        let ok = w >= width && h >= height;
        const consider = (bw: number, bh: number) => {
          if (!Number.isFinite(bw) || !Number.isFinite(bh)) return;
          if (bw >= width && bh >= height) ok = true;
          if (bw * bh > w * h) {
            w = bw;
            h = bh;
          }
        };
        const type = (el as HTMLInputElement).type;
        const choice = el instanceof HTMLInputElement && (type === "checkbox" || type === "radio");
        for (const label of choice ? Array.from((el as HTMLInputElement).labels ?? []) : []) {
          const box = label.getBoundingClientRect();
          consider(box.width, box.height);
        }
        const style = getComputedStyle(el, "::before");
        const positioned = style.position === "absolute" || style.position === "fixed";
        if (positioned && style.content !== "none" && style.content !== "normal") {
          consider(Number.parseFloat(style.width), Number.parseFloat(style.height));
        }
        const r = { width: w, height: h };
        if (!ok) {
          const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
          out.push(
            `${el.tagName.toLowerCase()} "${name}" is ${r.width}x${r.height}, needs ${width}x${height}`,
          );
        }
      }
      return out;
    },
    { min, selector: FOCUSABLE },
  );
}
