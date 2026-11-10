import type { JSX } from "react";

export interface IntentPromptProps {
  open?: boolean;
  app?: string;
  title?: string;
  message?: string;
  waitLabel?: string;
  onReturn?: () => void;
  onWait?: () => void;
  onContinue?: (reason: "Work" | "Quick check" | "Other") => void;
}

export function IntentPrompt(_props: IntentPromptProps): JSX.Element {
  return <></>;
}
