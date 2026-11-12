import { Choice, SettingsRow } from "@orasenda/ui";
import type { NotificationStatus } from "../../../ipc/bindings";

export type NotificationsRow = {
  line: string | null;
  /** The index value. */
  value: string;
  action: "ask" | "open" | null;
};

/** The spec's eight-row table (Behavior & edge cases). */
export function notificationsRow(
  status: NotificationStatus,
  preference: boolean,
  asking: boolean,
): NotificationsRow {
  if (status === "unavailable") {
    return {
      line: "Notifications aren't available in this build.",
      value: "Not available",
      action: null,
    };
  }
  if (asking) {
    return {
      line: "Waiting for your answer in the macOS prompt.",
      value: "Asking macOS",
      action: null,
    };
  }
  if (status === "notDetermined") {
    return preference
      ? {
          line: "On here, but macOS hasn't been asked yet.",
          value: "Not asked yet",
          action: "ask",
        }
      : { line: "Turning this on asks macOS for permission, once.", value: "Off", action: null };
  }
  if (status === "granted") {
    return preference
      ? {
          line: "On. A notification appears when a session ends while Orasenda is in the background.",
          value: "On",
          action: null,
        }
      : { line: null, value: "Off", action: null };
  }
  return preference
    ? {
        line: "On here, but macOS has notifications off for Orasenda. Allow them in System Settings and Orasenda will use them.",
        value: "Off in macOS",
        action: "open",
      }
    : { line: "macOS has notifications off for Orasenda.", value: "Off in macOS", action: "open" };
}

type Props = {
  checked: boolean;
  asking: boolean;
  disabled: boolean;
  disabledReason?: string;
  /** The line beside the box, already including any failure reason. */
  line: string | null;
  action: "ask" | "open" | null;
  onToggle: (checked: boolean) => void;
  /** "Two minutes before the end": its box, and whether it is the one asking macOS. */
  twoMinutes: boolean;
  twoMinutesAsking: boolean;
  onTwoMinutes: (checked: boolean) => void;
  onAsk: () => void;
  onOpen: () => void;
};

export function Notifications({
  checked,
  asking,
  disabled,
  disabledReason,
  line,
  action,
  onToggle,
  twoMinutes,
  twoMinutesAsking,
  onTwoMinutes,
  onAsk,
  onOpen,
}: Props) {
  // Only ids that are in the DOM: the line renders when set, the reason when set.
  const describedBy = [
    line ? "notifications-status" : "",
    "notifications-help",
    disabledReason ? "notifications-why" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section id="settings-notifications" aria-labelledby="settings-notifications-heading">
      <h2 id="settings-notifications-heading" tabIndex={-1} className="settings-heading">
        Notifications
      </h2>
      <SettingsRow
        id="notifications"
        label="Notifications"
        helper="Orasenda only notifies you about your sessions. Never about stats or streaks."
        status={line ?? undefined}
        actionLabel={
          action === "ask" ? "Ask macOS" : action === "open" ? "Open System Settings" : undefined
        }
        actionName={
          action === "open" ? "Open System Settings, Notifications for Orasenda" : undefined
        }
        onAction={action === "ask" ? onAsk : action === "open" ? onOpen : undefined}
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-busy={asking ? "true" : undefined}
          onChange={(event) => onToggle(event.target.checked)}
        >
          Tell me when a session ends
        </Choice>
        <Choice
          type="checkbox"
          checked={twoMinutes}
          disabled={disabled}
          aria-describedby="notifications-two-help"
          aria-busy={twoMinutesAsking ? "true" : undefined}
          onChange={(event) => onTwoMinutes(event.target.checked)}
        >
          Two minutes before the end
        </Choice>
        <p id="notifications-two-help" className="app-muted">
          Only while Orasenda is in the background.
        </p>
      </SettingsRow>
    </section>
  );
}
