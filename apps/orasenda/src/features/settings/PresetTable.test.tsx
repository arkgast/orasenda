import { PRESETS } from "@shared/test/fixtures";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PresetTable } from "./PresetTable";

const rows = PRESETS;
const steady = rows[1]?.id;

function table(patch: Partial<Parameters<typeof PresetTable>[0]> = {}) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  const onSelect = vi.fn();
  render(
    <PresetTable
      presets={rows}
      selectedId={steady}
      group="g"
      disabled={false}
      locked={false}
      canRemove
      removeReason="At least one preset stays."
      onSelect={onSelect}
      onEdit={onEdit}
      onRemove={onRemove}
      {...patch}
    />,
  );
  return { onEdit, onRemove, onSelect };
}

test("preset_table_columns", () => {
  table();
  const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
  expect(headers).toEqual(["Name", "Focus", "Break", "Long break", "Rounds", "Actions"]);
  const row = screen.getAllByRole("row")[2] as HTMLElement;
  const cells = within(row).getAllByRole("cell");
  expect(cells.slice(1, 5).map((c) => c.textContent)).toEqual(["25", "5", "15", "4"]);
  expect(
    within(cells[0] as HTMLElement).getByRole("radio", { name: "Steady Focus" }),
  ).toBeChecked();
});

test("preset_actions_named", () => {
  const { onEdit, onRemove } = table();
  expect(screen.queryByText("Edit")).toBeNull();
  expect(screen.queryByText("Remove")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit Steady Focus" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Steady Focus" }));
  expect(onEdit).toHaveBeenCalledWith(steady);
  expect(onRemove).toHaveBeenCalledWith(steady);
});

test("the_last_preset_cannot_be_removed_here", () => {
  table({ presets: [rows[1] as (typeof rows)[number]], canRemove: false });
  expect(screen.getByRole("button", { name: "Remove Steady Focus" })).toBeDisabled();
  expect(screen.getByText("At least one preset stays.")).toBeInTheDocument();
});
