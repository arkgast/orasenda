import { type ReactElement, type ReactNode, useId } from "react";

export type RoutineToday = "notStarted" | "inProgress" | "finished";

export interface RoutineCardProps {
  name: string;
  /** Time and days, e.g. "07:00 · Every day". */
  meta?: string;
  today: RoutineToday;
  /** The host's words for today, e.g. "2 of 5 done today". A default line stands in when absent. */
  todayLine?: string;
  /** The heading level of the name; 2 under a page title, 3 inside a section. */
  headingLevel?: 2 | 3;
  /** The steps, usually read-only RoutineItems. */
  children?: ReactNode;
  /** Start and the More menu. */
  actions?: ReactNode;
  /** The WellnessNote for a templated routine. */
  footer?: ReactNode;
}

const DEFAULT_LINE: Record<RoutineToday, string> = {
  notStarted: "Not started today",
  inProgress: "In progress today",
  finished: "Done today",
};

const SHAPE: Record<RoutineToday, "ring" | "half" | "check"> = {
  notStarted: "ring",
  inProgress: "half",
  finished: "check",
};

/** Today's state as a shape: a hollow ring, a half-filled ring or a filled check. Words sit beside it. */
function TodayShape({ today }: { today: RoutineToday }): ReactElement {
  return (
    <svg
      data-slot="routine-card-shape"
      data-shape={SHAPE[today]}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="size-icon-md flex-none"
    >
      {today === "finished" ? (
        <>
          <circle cx={8} cy={8} r={7.5} className="fill-break" />
          <path
            d="M4.5 8.3 7 10.8 11.5 5.5"
            strokeWidth={2}
            className="fill-none stroke-on-break"
          />
        </>
      ) : (
        <>
          <circle cx={8} cy={8} r={6.5} strokeWidth={2} className="fill-none stroke-line-strong" />
          {today === "inProgress" ? (
            <path d="M8 1.5a6.5 6.5 0 0 0 0 13z" className="fill-break" />
          ) : null}
        </>
      )}
    </svg>
  );
}

/** One routine on the Routines page: its name, time and days, today's state and its steps. */
export function RoutineCard(props: RoutineCardProps): ReactElement {
  const headingId = useId();
  const today: RoutineToday = props.today in SHAPE ? props.today : "notStarted";
  const Heading = props.headingLevel === 3 ? "h3" : "h2";
  return (
    <article
      data-slot="routine-card"
      data-today={today}
      aria-labelledby={headingId}
      className="@container flex w-full max-w-full flex-col gap-3 rounded-md border border-line-strong border-s-4 border-s-routine bg-surface-raised p-4 text-ink shadow-raised wrap-anywhere"
    >
      <div
        data-slot="routine-card-top"
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id={headingId} className="m-0 text-heading text-ink">
            {props.name}
          </Heading>
          {props.meta ? (
            <p data-slot="routine-card-meta" className="m-0 text-body-sm text-ink-muted">
              {props.meta}
            </p>
          ) : null}
        </div>
        {props.actions ? (
          <div data-slot="routine-card-actions" className="flex flex-wrap items-center gap-2">
            {props.actions}
          </div>
        ) : null}
      </div>
      <p
        data-slot="routine-card-today"
        data-today={today}
        className="m-0 inline-flex items-center gap-2 text-body-sm text-ink"
      >
        <TodayShape today={today} />
        {props.todayLine || DEFAULT_LINE[today]}
      </p>
      {props.children ? (
        <div data-slot="routine-card-steps" className="flex flex-col gap-2">
          {props.children}
        </div>
      ) : null}
      {props.footer ? <div data-slot="routine-card-footer">{props.footer}</div> : null}
    </article>
  );
}
