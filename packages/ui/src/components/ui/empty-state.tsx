import type { ReactElement } from "react";

export type EmptyStateProps = { title?: string; message?: string; actionLabel?: string; onAction?: () => void; variant?: "default" } | { title?: never; message?: string; variant: "inline"; actionLabel?: never; onAction?: never };

export function EmptyState(_props: EmptyStateProps): ReactElement {
  return <div />;
}
