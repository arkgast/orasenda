import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Choice, ChoiceGroup } from "./choice";

test("radio_group_is_a_fieldset_named_by_its_legend", () => {
  render(
    <ChoiceGroup legend="Preset">
      <Choice name="p" value="a">
        Classic
      </Choice>
      <Choice name="p" value="b">
        Deep
      </Choice>
    </ChoiceGroup>,
  );
  const group = screen.getByRole("group", { name: "Preset" });
  expect(group.tagName).toBe("FIELDSET");
  expect(group).toHaveAttribute("data-slot", "choice-group");
  const radios = screen.getAllByRole("radio");
  expect(radios.map((r) => r.getAttribute("name"))).toEqual(["p", "p"]);
  expect(radios[0].closest("label")).toHaveAttribute("data-slot", "choice");
});

test("labelled_by_renders_a_radiogroup", () => {
  render(
    <>
      <p id="lbl">Preset</p>
      <ChoiceGroup labelledBy="lbl">
        <Choice name="p" value="a">
          Classic
        </Choice>
      </ChoiceGroup>
    </>,
  );
  const group = screen.getByRole("radiogroup", { name: "Preset" });
  expect(group.tagName).toBe("DIV");
});

test("checked_state_is_native_and_the_chip_names_it", () => {
  render(
    <ChoiceGroup legend="Preset">
      <Choice name="p" value="a" defaultChecked>
        Classic
      </Choice>
      <Choice name="p" value="b">
        Deep
      </Choice>
    </ChoiceGroup>,
  );
  expect(screen.getByRole("radio", { name: "Classic" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Deep" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Deep" }));
  expect(screen.getByRole("radio", { name: "Deep" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Classic" })).not.toBeChecked();
});

test("disabled_choice_stays_readable_and_is_disabled", () => {
  render(
    <ChoiceGroup legend="Apps">
      <Choice type="checkbox" disabled>
        No bundle id
      </Choice>
    </ChoiceGroup>,
  );
  const box = screen.getByRole("checkbox", { name: "No bundle id" });
  expect(box).toBeDisabled();
  expect(screen.getByText("No bundle id")).toBeVisible();
});

test("checkbox_toggles_independently", () => {
  render(
    <ChoiceGroup legend="Apps">
      <Choice type="checkbox">Safari</Choice>
      <Choice type="checkbox">Notes</Choice>
    </ChoiceGroup>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Safari" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));
  expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
});

test("segmented_group_and_long_choice_carry_their_variant", () => {
  const { container } = render(
    <>
      <ChoiceGroup legend="List" variant="segmented">
        <Choice name="l" value="a">
          Today
        </Choice>
      </ChoiceGroup>
      <ChoiceGroup legend="Strength">
        <Choice long name="s" value="x" description="Gentle reminders.">
          Light
        </Choice>
      </ChoiceGroup>
    </>,
  );
  expect(container.querySelector("[data-slot=choice-group]")).toHaveAttribute(
    "data-variant",
    "segmented",
  );
  expect(screen.getByRole("radio", { name: /Light/ }).closest("label")).toHaveAttribute(
    "data-variant",
    "long",
  );
  expect(screen.getByText("Gentle reminders.")).toBeVisible();
});
