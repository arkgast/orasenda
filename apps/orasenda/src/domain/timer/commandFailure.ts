import type { TimerCommandError } from "@shared/ipc/bindings";

/**
 * Races between surfaces (ADR-013): another surface got there first, so the next view is the truth
 * and nothing is shown. Any other error, `invalidSpec` included, is a failure.
 */
export function commandFailure(error: TimerCommandError): "race" | "failure" {
  switch (error.kind) {
    case "alreadyRunning":
    case "nothingRunning":
    case "wrongState":
    case "extensionCap":
      return "race";
    default:
      return "failure";
  }
}
