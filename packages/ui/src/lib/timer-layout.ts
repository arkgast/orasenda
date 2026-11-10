export type TimerLayout = "ring" | "strip" | "stackedStrip";

/** The timer surface's content box. windowWidth is the window's inner width, for the compact test only. */
export interface TimerLayoutBox {
  contentWidth: number;
  contentHeight: number;
  windowWidth: number;
}

// The px values of these tokens in tokens.json (timerLayout.test.tsx reads the file and compares).
const LAYOUT_TOKENS = {
  "layout-ring-min-height": 360,
  "layout-compact-width": 640,
  "layout-strip-height": 420,
} as const;

/** The rule, with the px values of the tokens it reads (equal to tokens.json) on `tokens`. */
export interface TimerLayoutFn {
  (box: TimerLayoutBox): TimerLayout;
  readonly tokens: Readonly<typeof LAYOUT_TOKENS>;
}

function layout(box: TimerLayoutBox): TimerLayout {
  const { contentWidth: width, contentHeight: height } = box;
  if (height < LAYOUT_TOKENS["layout-ring-min-height"])
    return box.windowWidth >= LAYOUT_TOKENS["layout-compact-width"] ? "strip" : "stackedStrip";
  if (width > 2 * height && height < LAYOUT_TOKENS["layout-strip-height"]) return "strip";
  return "ring";
}

/**
 * Which face the timer takes. Pure: hosts call it on resize only, never on a tick.
 * contentHeight < layout-ring-min-height: "strip" when windowWidth >= layout-compact-width, else
 * "stackedStrip". Otherwise "strip" when contentWidth > 2 x contentHeight and contentHeight <
 * layout-strip-height. Otherwise "ring".
 */
export const timerLayout: TimerLayoutFn = Object.assign(layout, {
  tokens: Object.freeze({ ...LAYOUT_TOKENS }),
});
