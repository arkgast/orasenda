import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { expect, test } from "vitest";
import { PopoverMenu } from "./popover-menu";

const ITEMS = [
  { id: "a", label: "Alpha", kind: "link" as const },
  { id: "b", label: "Beta", kind: "link" as const },
];

function Host({ withReturn }: { withReturn: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const home = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div ref={home} tabIndex={0} data-testid="home">
        row
      </div>
      <span ref={anchor}>
        <button type="button">Trigger</button>
      </span>
      {open ? (
        <PopoverMenu
          heading="Things"
          items={ITEMS}
          anchor={anchor}
          returnFocus={withReturn ? home : undefined}
          onSelect={() => {}}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

async function menuItem(name: string) {
  const menu = await screen.findByRole("menu");
  return within(menu).getByRole("menuitem", { name });
}

test("return_focus_prop_overrides_anchor", async () => {
  render(<Host withReturn />);
  fireEvent.keyDown(await menuItem("Alpha"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByTestId("home")).toHaveFocus();
});

test("return_focus_prop_applies_when_choosing", async () => {
  render(<Host withReturn />);
  fireEvent.keyDown(await menuItem("Beta"), { key: "Enter" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByTestId("home")).toHaveFocus();
});

test("without_return_focus_the_anchor_gets_focus", async () => {
  render(<Host withReturn={false} />);
  fireEvent.keyDown(await menuItem("Alpha"), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Trigger" })).toHaveFocus();
});
