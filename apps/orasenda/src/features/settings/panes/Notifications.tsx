import { Choice, SettingsRow } from "@orasenda/ui";
import type { NotificationStatus } from "@shared/ipc/bindings";
import type { ReactNode, Ref } from "react";

export type NotificationsRow = {
  line: string | null;
  /** The short state word. */
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

/**
 * The "When a routine is due" row's line: the session row's line for the same status and
 * preference, except that "on and allowed" names routines and "on but off in macOS" stays short.
 * Its actions stay on the session row, so the page has one "Ask macOS" and one "Open System
 * Settings", and the long "Allow them in System Settings" line is said once, there.
 */
export function routineDueLine(
  status: NotificationStatus,
  preference: boolean,
  asking: boolean,
): string | null {
  if (preference && !asking) {
    if (status === "granted") return "On. A notification appears once when a routine's time comes.";
    if (status === "denied") return "On here, but macOS has notifications off for Orasenda.";
  }
  return notificationsRow(status, preference, asking).line;
}

type Props = {
  headingRef: Ref<HTMLHeadingElement>;
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
  /** "When a routine is due": its box, whether it is asking macOS, and its own line. */
  routineDue: boolean;
  routineAsking: boolean;
  routineLine: string | null;
  onRoutineDue: (checked: boolean) => void;
  onAsk: () => void;
  onOpen: () => void;
  /** More rows after Routines (the review nudges). */
  children?: ReactNode;
};

export function Notifications({
  headingRef,
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
  routineDue,
  routineAsking,
  routineLine,
  onRoutineDue,
  onAsk,
  onOpen,
  children,
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
      <h2
        ref={headingRef}
        id="settings-notifications-heading"
        tabIndex={-1}
        className="settings-heading"
      >
        Notifications
      </h2>
      <SettingsRow
        id="notifications"
        label="Notifications"
        helper="Orasenda only notifies you about your sessions, routines and reviews. Never about stats or streaks."
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
      <SettingsRow
        id="notifications-routines"
        label="Routines"
        helper="One notification when a routine's time comes, unless you've already started or finished it."
        status={routineLine ?? undefined}
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={routineDue}
          disabled={disabled}
          aria-describedby={[
            routineLine ? "notifications-routines-status" : "",
            "notifications-routines-help",
            disabledReason ? "notifications-routines-why" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-busy={routineAsking ? "true" : undefined}
          onChange={(event) => onRoutineDue(event.target.checked)}
        >
          When a routine is due
        </Choice>
      </SettingsRow>
      {children}
    </section>
  );
}
