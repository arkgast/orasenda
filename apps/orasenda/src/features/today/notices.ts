import type { MilestoneEvent_Serialize } from "@shared/ipc/bindings";

/** A one-shot notice and the session it is about (`null` when the event named none). */
export type Notice = {
  text: string;
  sessionId: string | null;
  /** The deep-hours line goes on into the break that follows its session. */
  persist?: boolean;
};

/**
 * What a milestone does to the one-shot notice: sets one, keeps the deep-hours line through the
 * break that follows it, or (any other milestone) ends it. `deepHours` is the saved cap.
 */
export function noticeAfter(
  previous: Notice | null,
  event: MilestoneEvent_Serialize,
  deepHours: number,
): Notice | null {
  const sessionId = event.sessionId;
  switch (event.kind) {
    case "ended":
      if (event.phase === "break") {
        const text =
          event.endReason === "completed" ? "Break over. Start when you're ready." : "Break ended.";
        return { text, sessionId };
      }
      return { text: "Session ended.", sessionId };
    case "recovered":
      return { text: "Your last session ended while Orasenda was closed.", sessionId };
    case "capReached":
      return {
        text: `You've focused ${deepHours} hours today. A good place to stop.`,
        sessionId,
        persist: true,
      };
    case "breakStarted":
      return previous?.persist ? previous : null;
    default:
      return null;
  }
}
