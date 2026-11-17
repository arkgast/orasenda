import { Choice, Select, SettingsRow } from "@orasenda/ui";
import type { NotificationStatus, WeeklyDay } from "@shared/ipc/bindings";
import { notificationsRow } from "../panes/Notifications";
import { ReviewTimeField } from "./ReviewTimeField";
import { DAY_OPTIONS } from "./reviewTime";

/** A nudge's line: the session row's wording for the same status, short when it is on and allowed. */
export function nudgeLine(
  status: NotificationStatus,
  preference: boolean,
  asking: boolean,
): string | null {
  if (status === "granted" && preference && !asking) {
    return "On. A notification appears once when it's time.";
  }
  return notificationsRow(status, preference, asking).line;
}

export type NudgeSwitch = {
  checked: boolean;
  asking: boolean;
  /** The line beside the box, already including any failure reason. */
  line: string | null;
  onToggle: (checked: boolean) => void;
};

export type ReviewNudgeProps = {
  shutdown: NudgeSwitch;
  weekly: NudgeSwitch;
  /** Stored minutes after midnight. */
  time: number;
  day: WeeklyDay;
  disabled: boolean;
  disabledReason?: string;
  timeStatus?: string;
  onTime: (minutes: number) => void;
  onDay: (day: WeeklyDay) => void;
};

const WEEKDAYS = new Set<string>(DAY_OPTIONS.map((option) => option.value));

function describedBy(id: string, line: string | null, reason: string | undefined) {
  return [line ? `${id}-status` : "", `${id}-help`, reason ? `${id}-why` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Settings › Notifications, after Routines: the two review nudges, both off until chosen. */
export function ReviewNudgeRows(props: ReviewNudgeProps) {
  const { shutdown, weekly, disabled, disabledReason } = props;
  return (
    <>
      <SettingsRow
        id="notifications-shutdown"
        label="Shutdown"
        helper="One calm reminder on weekdays to close the day."
        status={shutdown.line ?? undefined}
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={shutdown.checked}
          disabled={disabled}
          aria-describedby={describedBy("notifications-shutdown", shutdown.line, disabledReason)}
          aria-busy={shutdown.asking ? "true" : undefined}
          onChange={(event) => shutdown.onToggle(event.target.checked)}
        >
          When it's time to close the day
        </Choice>
      </SettingsRow>
      <SettingsRow
        id="notifications-weekly"
        label="Weekly review"
        helper="One calm reminder on the day you choose."
        status={weekly.line ?? undefined}
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={weekly.checked}
          disabled={disabled}
          aria-describedby={describedBy("notifications-weekly", weekly.line, disabledReason)}
          aria-busy={weekly.asking ? "true" : undefined}
          onChange={(event) => weekly.onToggle(event.target.checked)}
        >
          When it's time for the weekly review
        </Choice>
        {weekly.checked ? (
          <Select
            label="Weekly review day"
            labelHidden
            aria-describedby="notifications-weekly-help"
            value={props.day}
            disabled={disabled}
            options={DAY_OPTIONS}
            onChange={(event) => {
              if (WEEKDAYS.has(event.target.value)) props.onDay(event.target.value as WeeklyDay);
            }}
          />
        ) : null}
      </SettingsRow>
      {shutdown.checked || weekly.checked ? (
        <SettingsRow
          id="notifications-review-time"
          label="Review time"
          helper="When either reminder comes."
          status={props.timeStatus}
          disabledReason={disabledReason}
        >
          <ReviewTimeField saved={props.time} disabled={disabled} onCommit={props.onTime} />
        </SettingsRow>
      ) : null}
    </>
  );
}
