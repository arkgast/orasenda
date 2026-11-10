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
  children?: ReactNode;
}

/**
 * One frame for a page: a header, a reserved status row and a region; the flow variant adds a footer.
 * A page component, so it follows the viewport: space-4 all round below `sm`, then space-5 / space-6.
 */
export function PageFrame(props: PageFrameProps): ReactElement {
  const flow = props.variant === "flow";
  const title = props.compactPicker ? (
    <div data-slot="page-frame-title" className="flex min-w-0 items-center">
      {props.compactPicker}
      <h1 tabIndex={-1} className="sr-only">
        {props.title}
      </h1>
    </div>
  ) : (
    <h1
      tabIndex={-1}
      className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-title"
    >
      {props.title}
    </h1>
  );
  return (
    <div
      data-slot="page-frame"
      data-variant={flow ? "flow" : "list"}
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 bg-surface p-4 text-ink sm:px-6 sm:pt-5 sm:pb-6",
      )}
    >
      <header
        data-slot="page-frame-header"
        className="flex h-hit-min min-w-0 shrink-0 items-center justify-between gap-3"
      >
        {title}
        {props.primary ||
          (props.step ? (
            <span className="whitespace-nowrap text-body-sm text-ink-muted">{props.step}</span>
          ) : null)}
      </header>
      <div data-slot="page-frame-status" className="h-hit-min min-h-0 min-w-0 shrink-0">
        {props.status}
      </div>
      <div data-slot="page-frame-body" className="min-h-0 min-w-0 flex-1 *:h-full">
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
