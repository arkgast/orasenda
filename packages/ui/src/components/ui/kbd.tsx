import type { ReactElement } from "react";
import { describeShortcut } from "../../lib/shortcuts";

/** In running text, spoken is required because the glyph is aria-hidden; inside a Tooltip the tooltip label speaks. */
export type KbdProps = { keys: string } & (
  | { inTooltip: true; spoken?: string }
  | { inTooltip?: false; spoken: string }
);

/** A key name inline in a tip, a tooltip or a caption. Never a control. Sized by the kbd type token, so it follows the text around it. */
export function Kbd(props: KbdProps): ReactElement {
  const glyph = (
    <span
      data-slot="kbd"
      aria-hidden="true"
      className="inline-block whitespace-nowrap rounded-sm border border-line-strong bg-surface-raised px-1 font-mono text-kbd text-ink tabular-nums"
    >
      {props.keys}
    </span>
  );
  if (props.inTooltip && props.spoken == null) return glyph;
  return (
    <>
      {glyph}
      <span data-slot="kbd-spoken" className="sr-only">
        {props.spoken ?? describeShortcut(props.keys).spoken}
      </span>
    </>
  );
}
