import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DataTable, type DataTableColumn } from "../../index";

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty("--duration-quick", "160ms");
});
afterEach(() => {
  vi.useRealTimers();
});

interface Row {
  id: string;
  name: string;
  size: number;
}
const ROWS: Row[] = [
  { id: "a", name: "Steady Focus", size: 320 },
  { id: "b", name: "Short Sprints", size: 301 },
];
const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "size", header: "Size", cell: (r) => `${r.size} KB`, numeric: true },
];

function table(extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return (
    <DataTable
      caption="Presets"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      empty={<p>Nothing here yet.</p>}
      {...extra}
    />
  );
}

test("data_table_semantic_caption", () => {
  render(table());
  const t = screen.getByRole("table", { name: "Presets" });
  expect(t.querySelector("caption")?.textContent).toBe("Presets");
  expect(
    within(t)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Name", "Size"]);
  expect(within(t).getAllByRole("columnheader")[0]?.getAttribute("scope")).toBe("col");
  expect(within(t).getAllByRole("row")).toHaveLength(3);
  expect(within(t).getByText("320 KB").getAttribute("data-numeric")).toBe("true");
});

test("data_table_action_names_row", () => {
  const onSelect = vi.fn();
  render(
    table({
      actions: (r) => [{ label: `Edit ${r.name}`, icon: "edit", onSelect }],
    }),
  );
  const button = screen.getByRole("button", { name: "Edit Steady Focus" });
  expect(screen.getByRole("button", { name: "Edit Short Sprints" })).toBeTruthy();
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledTimes(1);
  fireEvent.pointerEnter(button);
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(document.querySelector("[data-slot=tooltip-label]")?.textContent).toBe(
    "Edit Steady Focus",
  );
});

test("data_table_disabled_action_keeps_tooltip_and_reason", () => {
  render(
    table({
      actions: (r) => [
        {
          label: `Restore ${r.name}`,
          icon: "restore",
          onSelect: () => undefined,
          disabled: r.id === "a",
          reason: r.id === "a" ? "From a newer Orasenda" : undefined,
        },
      ],
    }),
  );
  const button = screen.getByRole("button", { name: "Restore Steady Focus" });
  expect(button.hasAttribute("disabled")).toBe(true);
  const reason = screen.getByText("From a newer Orasenda");
  expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  fireEvent.pointerEnter(button);
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(document.querySelector("[data-slot=tooltip-label]")?.textContent).toBe(
    "Restore Steady Focus",
  );
  expect(
    screen.getByRole("button", { name: "Restore Short Sprints" }).hasAttribute("disabled"),
  ).toBe(false);
});

test("data_table_empty_state", () => {
  render(table({ rows: [] }));
  expect(screen.getByText("Nothing here yet.")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Presets" })).toBeTruthy();
});

test("data_table_selection_cell_and_footer", () => {
  render(
    table({
      selection: {
        header: "Chosen",
        cell: (r) => <input type="radio" name="p" aria-label={r.name} />,
      },
      footer: "2 backups, 621 KB",
    }),
  );
  expect(screen.getByRole("radio", { name: "Steady Focus" })).toBeTruthy();
  expect(screen.getAllByRole("columnheader")[0]?.textContent).toBe("Chosen");
  expect(screen.getByText("2 backups, 621 KB")).toBeTruthy();
});
