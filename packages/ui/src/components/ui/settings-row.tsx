import type { JSX, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface SettingsRowProps {
  /** Fixes the base of the generated ids (<id>-label, <id>-help, <id>-status, <id>-why); otherwise useId(). */
  id?: string;
  label: string;
  helper: string;
  status?: ReactNode;
  actionLabel?: string;
  /** The accessible name when it differs from actionLabel. */
  actionName?: string;
  /** Defaults to 'quiet'. */
  actionVariant?: "quiet" | "ghost";
  onAction?: () => void;
  disabledReason?: string;
  children: ReactNode;
}

const LINE = "m-0 flex flex-wrap items-center gap-2 text-body-sm";

/** One setting: its label, its control, an always-visible helper and one line for its own status. */
export function SettingsRow(props: SettingsRowProps): JSX.Element {
  const generated = useId();
  const id = props.id || generated;
  const described = [
    `${id}-help`,
    props.status ? `${id}-status` : "",
    props.disabledReason ? `${id}-why` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const action =
    props.actionLabel && props.onAction ? (
      <Button
        variant={props.actionVariant === "ghost" ? "ghost" : "quiet"}
        aria-label={props.actionName || undefined}
        onClick={props.onAction}
      >
        {props.actionLabel}
      </Button>
    ) : null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the README fixes a div group named by its label and described by helper and status; a fieldset legend cannot carry that description
    <div
      data-slot="settings-row"
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={described}
      className="flex flex-col gap-2 border-b border-line py-4"
    >
      <p id={`${id}-label`} data-slot="settings-row-label" className="m-0 font-semibold">
        {props.label}
      </p>
      {props.children}
      <p id={`${id}-help`} data-slot="settings-row-help" className={cn(LINE, "text-ink-muted")}>
        {props.helper}
      </p>
      {props.status || action ? (
        <div data-slot="settings-row-line" className="flex flex-wrap items-center gap-2">
          {props.status ? (
            <p id={`${id}-status`} data-slot="settings-row-status" className={cn(LINE, "text-ink")}>
              {props.status}
            </p>
          ) : null}
          {action}
        </div>
      ) : null}
      {props.disabledReason ? (
        <p id={`${id}-why`} data-slot="settings-row-why" className={cn(LINE, "text-ink")}>
          {props.disabledReason}
        </p>
      ) : null}
    </div>
  );
}
