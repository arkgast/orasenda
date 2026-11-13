import type { JSX } from "react";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export interface InboxRowProps {
  /** The note. It wraps and is never truncated. */
  text: string;
  kind: "internal" | "external";
  /** The time as shown ("09:41"). */
  time: string;
  /** The time in words for VoiceOver ("Captured at 9:41 AM"). */
  timeLabel: string;
  onRemove: () => void;
  /** The Remove button's name ("Remove note: Ask Sam about the invoice"). */
  removeName: string;
}

const KIND_WORD = { internal: "Internal", external: "External" } as const;

/** One captured note in the Inbox list. The host provides the surrounding list. */
export function InboxRow({
  text,
  kind,
  time,
  timeLabel,
  onRemove,
  removeName,
}: InboxRowProps): JSX.Element {
  return (
    <li
      data-slot="inbox-row"
      data-kind={kind}
      className="flex min-h-hit-min list-none items-start justify-between gap-3 border-b border-line py-2 pe-1"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{text}</p>
        <p data-slot="inbox-row-meta" className="m-0 text-body-sm text-ink-muted">
          {KIND_WORD[kind]} ·{" "}
          <span aria-hidden="true" className="tabular-nums">
            {time}
          </span>
          <span className="sr-only">{timeLabel}</span>
        </p>
      </div>
      <IconButton label={removeName} icon={<Icon name="close" />} onClick={onRemove} />
    </li>
  );
}
