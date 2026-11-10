import type { JSX } from "react";

export type InterruptionKind = "internal" | "external";
export interface CapturePadProps {
  open?: boolean;
  value: string;
  kind: InterruptionKind;
  onChange: (value: string) => void;
  onKindChange: (kind: InterruptionKind) => void;
  onSave: (note: { text: string; kind: InterruptionKind }) => void | Promise<void>;
  onClose: () => void;
}
export function CapturePad(_props: CapturePadProps): JSX.Element {
  return <div />;
}
