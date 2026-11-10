import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface ScrollRegionProps {
  label: string;
  children?: ReactNode;
}

const FOCUSABLE =
  "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

// The bar is always drawn (overflow-y-scroll plus a sized webkit track) so macOS overlay scrollbars never
// hide it and the gutter never shifts. Fixed sizes: the 1px hairline and the hit-floor thumb and edge row.
// scroll-pb-6 is the edge row (hit-floor) plus space-2, so a focused item is never hidden under it.
const region =
  "relative h-full min-h-0 overflow-y-scroll border-t border-clear p-1 scroll-pt-2 scroll-pb-6 data-[scrolled=true]:border-line outline-focus-ring focus-visible:outline-2 [&::-webkit-scrollbar]:w-scrollbar-size [&::-webkit-scrollbar-track]:bg-clear [&::-webkit-scrollbar-thumb]:min-h-hit-floor [&::-webkit-scrollbar-thumb]:rounded-pill [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-clear [&::-webkit-scrollbar-thumb]:bg-line-strong [&::-webkit-scrollbar-thumb]:bg-clip-padding";

/** The only scrolling box on a list page: a hairline once scrolled, and a "More below" row while content remains. */
export function ScrollRegion({ label, children }: ScrollRegionProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [focusable, setFocusable] = useState<boolean | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    setScrolled(el.scrollTop > 0);
    setFocusable(!!el.querySelector(FOCUSABLE));
  }, []);

  useEffect(() => {
    const el = ref.current;
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    if (ro && el) {
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    if (mo && el) mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  return (
    <section
      ref={ref}
      data-slot="scroll-region"
      aria-label={label}
      data-scrolled={scrolled ? "true" : "false"}
      // Focusable only when it holds no focusable item, so the keyboard can still scroll it.
      tabIndex={focusable === false ? 0 : undefined}
      onScroll={measure}
      className={cn(region)}
    >
      {children}
      {more ? (
        <div
          data-slot="scroll-region-more"
          aria-hidden="true"
          className="sticky bottom-0 flex min-h-hit-floor items-center gap-1 border-line border-t bg-surface px-2 text-caption text-ink-muted"
        >
          <svg
            className="size-icon-md shrink-0"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3.5 5.5L7 9l3.5-3.5" />
          </svg>{" "}
          More below
        </div>
      ) : null}
    </section>
  );
}
