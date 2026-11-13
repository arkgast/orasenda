import type { Settings } from "@shared/ipc/bindings";
import { mockBackend, type Replies, SETTINGS, settle } from "@shared/test/fixtures";
import { render } from "@testing-library/react";
import { resetPresetsForTests } from "./presets";
import { Today } from "./Today";

export async function renderToday(replies: Replies = {}) {
  resetPresetsForTests();
  const backend = mockBackend(replies);
  const view = render(<Today onNavigate={() => {}} />);
  await settle();
  return { backend, ...view };
}

export function savedSettings(settings: Partial<Settings>): Replies {
  return { settings_get: () => ({ ...SETTINGS, ...settings }) };
}

/** The status row's live regions that hold a line: the row itself is always mounted, empty at rest. */
export function statusNodes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="status"]')).filter(
    (node) => (node.textContent ?? "") !== "",
  );
}
