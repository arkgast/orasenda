import { EmptyState } from "@orasenda/ui";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Keeps a page that fails to load (a lost chunk) from blanking the whole window. */
export class PageBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("page failed to load", error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        title="This page did not load."
        message="Close Orasenda and open it again to try once more."
      />
    );
  }
}
