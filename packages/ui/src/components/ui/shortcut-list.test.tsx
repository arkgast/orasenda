import { render, screen, within } from "@testing-library/react";
import { beforeAll, expect, test } from "vitest";
import { ShortcutList } from "./shortcut-list";

beforeAll(() => {
  (window as unknown as { Orasenda: { strictShortcuts: boolean } }).Orasenda = {
    strictShortcuts: true,
  } as never;
});

const ITEMS = [
  { action: "Start focus", keys: "⌘↩", spokenKeys: "Command-Return" },
  { action: "Open Focus view", keys: "F", spokenKeys: "F key", off: true },
  { action: "Start, pause or resume", keys: "Space", spokenKeys: "Space" },
];

test("shortcut_list_is_a_table_of_action_and_keys", () => {
  render(<ShortcutList items={ITEMS} />);
  const table = screen.getByRole("table", { name: "All shortcuts" });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(within(table).getByRole("rowheader", { name: "Start focus" })).toBeTruthy();
});

test("shortcut_list_spoken_names", () => {
  render(<ShortcutList items={ITEMS} />);
  const row = screen.getByRole("row", { name: /Start focus/ });
  expect(row).toHaveTextContent("Command-Return");
  // The glyph is hidden from VoiceOver; the spoken name is the only text it reads.
  for (const glyph of row.querySelectorAll("[data-slot=kbd]"))
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
  expect(row.querySelector(".sr-only")?.textContent).toBe("Command-Return");
});

test("shortcut_list_off_word", () => {
  render(<ShortcutList items={ITEMS} />);
  const off = screen.getByRole("row", { name: /Open Focus view/ });
  expect(within(off).getByText("Off")).toBeVisible();
  expect(off).toHaveTextContent("F key");
  expect(within(screen.getByRole("row", { name: /Start focus/ })).queryByText("Off")).toBeNull();
});

test("shortcut_list_one_kbd_per_key", () => {
  render(<ShortcutList items={[{ action: "Today", keys: "Space F P", spokenKeys: "Space, F, P" }]} />);
  expect(document.querySelectorAll("[data-slot=kbd]")).toHaveLength(3);
});
