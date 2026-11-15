import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { EmptyState } from "./empty-state.tsx";

export function EmptyStateSpecimen(): ReactElement {
  return (
    <>
      <Frame state="empty-state-default" width={420} height={220}>
        <EmptyState
          title="Nothing here yet"
          message="Take it easy."
          actionLabel="Add task"
          onAction={() => undefined}
        />
      </Frame>
      <Frame state="empty-state-secondary-action" width={420} height={240}>
        <EmptyState
          title="No tasks yet."
          message="Add one, or bring some in."
          actionLabel="Add task"
          onAction={() => undefined}
          secondaryAction={{ label: "Import tasks…", onAction: () => undefined }}
        />
      </Frame>
    </>
  );
}
