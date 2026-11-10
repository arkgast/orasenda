import type { ReactElement, ReactNode } from "react";

export interface PageFrameProps {
  title: string;
  primary?: ReactNode;
  status?: ReactNode;
  variant?: "list" | "flow";
  step?: string;
  footer?: ReactNode;
  compactPicker?: ReactNode;
  children?: ReactNode;
}

export function PageFrame(_props: PageFrameProps): ReactElement {
  return <div />;
}
