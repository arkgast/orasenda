import type { ReactElement } from "react";

export interface TaskCardProps {
  title: string;
  type?: "deep" | "shallow";
  estimate?: number;
  done?: number;
  tracked?: string;
  project?: string;
  frog?: boolean;
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
}

export function TaskCard(_props: TaskCardProps): ReactElement {
  return <div />;
}
