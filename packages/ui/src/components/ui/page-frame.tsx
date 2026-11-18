import type { ReactElement, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface PageFrameProps {
  title: string;
  primary?: ReactNode;
  status?: ReactNode;
  variant?: "list" | "flow";
  step?: string;
  footer?: ReactNode;
  compactPicker?: ReactNode;
  /** "content" holds the header and status row in the same centred column as a `ScrollRegion width="content"`. */
  width?: "full" | "content";
  children?: ReactNode;
}

/**
 * One frame for a page: a header, a reserved status row and a region; the flow variant adds a footer.
 * A page component, so it follows the viewport: space-4 all round below `sm`, then space-5 / space-6.
 */
export function PageFrame(props: PageFrameProps): ReactElement {
  const flow = props.variant === "flow";
  const title = props.compactPicker ? (
    <div data-slot="page-frame-picker" className="flex min-w-0 flex-1 items-center">
      {props.compactPicker}
      <h1 tabIndex={-1} className="sr-only">
        {props.title}
      </h1>
    </div>
  ) : (
    <h1
      data-slot="page-frame-title"
      tabIndex={-1}
      className="overflow-hidden text-ellipsis whitespace-nowrap text-title"
    >
      {props.title}
    </h1>
  );
  const end =
    props.primary ||
    (props.step ? (
      <span className="whitespace-nowrap text-body-sm text-ink-muted">{props.step}</span>
    ) : null);
  const content = props.width === "content";
  return (
    <div
      data-slot="page-frame"
      data-variant={flow ? "flow" : "list"}
      className="flex h-full flex-col gap-2 bg-surface p-4 text-ink sm:px-6 sm:pt-5 sm:pb-6"
    >
      <header
        data-slot="page-frame-header"
        className="flex h-hit-min shrink-0 items-center justify-between gap-3"
      >
        {content ? (
          <InsetColumn
            slot="page-frame-header-column"
            className="flex h-hit-min items-center justify-between gap-3"
          >
            {title}
            {end}
          </InsetColumn>
        ) : (
          <>
            {title}
            {end}
          </>
        )}
      </header>
      <div data-slot="page-frame-status" className="h-hit-min shrink-0">
        {content ? (
          <InsetColumn slot="page-frame-status-column" className="h-full">
            {props.status}
          </InsetColumn>
        ) : (
          props.status
        )}
      </div>
      <div
        data-slot="page-frame-body"
        className="flex flex-1 flex-col overflow-hidden p-1 *:flex-1"
      >
        {props.children}
      </div>
      {flow ? (
        <footer
          data-slot="page-frame-footer"
          className="flex h-control-lg shrink-0 items-center gap-2 *:last:ms-auto"
        >
          {props.footer}
        </footer>
      ) : null}
    </div>
  );
}

// The body's p-1 plus the region's p-1 (space-2) at each side, and the scrollbar at the end, so the column
// lines up with a ScrollRegion width="content" column to the pixel.
function InsetColumn(props: {
  slot: string;
  className: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="ps-2 pe-2 min-w-0 flex-1 h-full">
      <div className="pe-scrollbar-size h-full">
        <div
          data-slot={props.slot}
          className={cn("mx-auto w-full max-w-content-width", props.className)}
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}
