import type { JSX } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { PlayGlyph } from "./glyphs";

export interface StartButtonProps {
  onStart: () => void;
  onQuickStart: () => void;
  /** @deprecated The finish time moves to the preset summary ("Classic · ends 15:20"). Still renders "Realistic finish · <time>" under the buttons. */
  finishTime?: string;
  /** @deprecated Use unavailable with a status-row line. Still disables both buttons. */
  disabled?: boolean;
  loading?: boolean;
  /** Guards Start and Just 2 minutes with aria-disabled: both stay focusable, and the host's status-row line says why. */
  unavailable?: boolean;
  /** The visible label below 400px of content (e.g. "Start"); the StartButton then fills its host's width, and the full label stays in the DOM and the name. */
  compactLabel?: string;
  /** true: aria-keyshortcuts="Space Meta+Enter"; false: "Meta+Enter"; omitted: no aria-keyshortcuts. Pass it only while the keys are live. */
  singleKeys?: boolean;
}

// The compact label shows below 400px of the StartButton's own box. 400px is a contract value (the
// README), not a theme step, so the two spans use an arbitrary container variant, not an arbitrary value.
/** The one primary action on Today: "Start focus" with the play glyph, and "Just 2 minutes" beside it. */
export function StartButton(props: StartButtonProps): JSX.Element {
  const guard = props.unavailable ? ({ "aria-disabled": true } as const) : null;
  const keys =
    props.singleKeys == null
      ? undefined
      : (props.singleKeys ? ["Space", "\u2318\u21a9"] : ["\u2318\u21a9"])
          .map((k) => describeShortcut(k).aria)
          .join(" ");
  const label = props.loading ? (
    "Starting…"
  ) : props.compactLabel ? (
    <>
      <span data-slot="start-button-full" className="[@container(max-width:399.98px)]:sr-only">
        Start focus
      </span>
      <span
        data-slot="start-button-compact"
        aria-hidden="true"
        className="hidden [@container(max-width:399.98px)]:inline"
      >
        {props.compactLabel}
      </span>
    </>
  ) : (
    "Start focus"
  );
  return (
    <div
      data-slot="start-button"
      className={cn("flex flex-col gap-fluid-stack", props.compactLabel && "@container w-full")}
    >
      <div className="flex flex-wrap items-center gap-fluid-stack">
        <Button
          variant="primary"
          size="lg"
          onClick={props.onStart}
          disabled={props.disabled}
          loading={props.loading}
          aria-keyshortcuts={keys}
          {...guard}
        >
          <PlayGlyph />
          {label}
        </Button>
        <Button onClick={props.onQuickStart} disabled={props.disabled || props.loading} {...guard}>
          Just 2 minutes
        </Button>
      </div>
      {props.finishTime ? (
        <p data-slot="start-button-finish" className="m-0 text-body-sm text-ink-muted">
          Realistic finish · <span className="font-mono tabular-nums">{props.finishTime}</span>
        </p>
      ) : null}
    </div>
  );
}
