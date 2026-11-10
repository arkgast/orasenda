import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { WellnessNote } from "./wellness-note";

test("exposes_note_with_name", () => {
  render(<WellnessNote />);
  const note = screen.getByRole("note");
  expect(note.textContent).toBe("Wellness suggestion, not medical advice.");
  expect(note.tagName).toBe("SPAN");
  expect(note.getAttribute("data-slot")).toBe("wellness-note");
});

test("renders_custom_children_with_word_or_shape", () => {
  render(<WellnessNote as="p">Evidence is limited. Not medical advice.</WellnessNote>);
  const note = screen.getByRole("note");
  expect(note.tagName).toBe("P");
  expect(note.textContent).toBe("Evidence is limited. Not medical advice.");
  const glyph = note.querySelector("svg");
  expect(glyph?.getAttribute("aria-hidden")).toBe("true");
});
