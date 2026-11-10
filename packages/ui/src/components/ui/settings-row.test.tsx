import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsRow } from "./settings-row";

test("settings_row_links_helper_and_status_by_describedby", () => {
  const onAction = vi.fn();
  const { container, rerender } = render(
    <SettingsRow
      label="Notifications"
      helper="Orasenda only notifies you when a session ends."
      status="macOS has notifications off for Orasenda."
      actionLabel="Open System Settings"
      onAction={onAction}
    >
      <input type="checkbox" aria-label="Tell me" />
    </SettingsRow>,
  );
  const group = screen.getByRole("group", { name: "Notifications" });
  expect(group).toHaveAccessibleDescription(
    "Orasenda only notifies you when a session ends. macOS has notifications off for Orasenda.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  expect(onAction).toHaveBeenCalledTimes(1);

  rerender(
    <SettingsRow
      label="Notifications"
      helper="Helper only."
      disabledReason="Read-only until you update Orasenda."
    >
      <input type="checkbox" aria-label="Tell me" />
    </SettingsRow>,
  );
  const ids =
    (container.querySelector("[aria-describedby]") as HTMLElement).getAttribute(
      "aria-describedby",
    ) ?? "";
  for (const id of ids.split(" ")) expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
  expect(screen.getByText("Read-only until you update Orasenda.")).toBeVisible();
});


test("settings_row_id_fixes_generated_ids", () => {
  const { container } = render(
    <SettingsRow
      id="notif"
      label="Notifications"
      helper="Helper."
      status="Status."
      disabledReason="Why."
    >
      <input type="checkbox" aria-label="Tell me" />
    </SettingsRow>,
  );
  for (const part of ["label", "help", "status", "why"]) {
    expect(container.querySelector(`[id="notif-${part}"]`)).not.toBeNull();
  }
  expect(screen.getByRole("group", { name: "Notifications" })).toHaveAttribute(
    "aria-describedby",
    "notif-help notif-status notif-why",
  );
});


test("renders_ghost_action_variant_with_word", () => {
  render(
    <SettingsRow label="L" helper="H" status="S" actionLabel="Show" onAction={() => {}} actionVariant="ghost">
      <input type="checkbox" aria-label="Tell me" />
    </SettingsRow>,
  );
  expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("data-variant", "ghost");
});

test("renders_quiet_action_variant_by_default", () => {
  render(
    <SettingsRow label="L" helper="H" actionLabel="Show" onAction={() => {}}>
      <input type="checkbox" aria-label="Tell me" />
    </SettingsRow>,
  );
  expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("data-variant", "quiet");
});

test("exposes_group_with_name", () => {
  render(
    <SettingsRow label="Length" helper="H" actionLabel="Go" actionName="Go now" onAction={() => {}}>
      <input aria-label="Minutes" />
    </SettingsRow>,
  );
  expect(screen.getByRole("group", { name: "Length" })).toHaveAttribute("data-slot", "settings-row");
  expect(screen.getByRole("button", { name: "Go now" })).toBeInTheDocument();
});
