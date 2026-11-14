import { mockBackend, type Replies, settle } from "@shared/test/fixtures";
import { render, screen, within } from "@testing-library/react";
import { RoutinesPage } from "./RoutinesPage";

type Props = Partial<Parameters<typeof RoutinesPage>[0]>;

/** Renders the Routines page on the mocked backend and lets the first list land. */
export async function renderRoutines(replies: Replies = {}, props: Props = {}) {
  const backend = mockBackend(replies);
  const view = render(<RoutinesPage onNavigate={() => {}} {...props} />);
  await settle();
  return { backend, ...view };
}

/** The routine card named `name`. */
export function card(name: string): HTMLElement {
  return screen.getByRole("article", { name });
}

/** The status row's text (the one line under the heading). */
export function statusText(container: HTMLElement): string {
  return container.querySelector("[data-slot=page-frame-status]")?.textContent ?? "";
}

export function primaries(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="button"][data-variant="primary"]'),
  );
}

export { within };
