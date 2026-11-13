import { expect, test } from "vitest";
import { cadenceOffers, type OfferInput } from "./cadenceOffers";

const FOCUS: OfferInput = {
  state: "running",
  phase: "focus",
  mode: "focus",
  canExtend: true,
  offer: null,
  checkIn: null,
};
const ids = (input: OfferInput) => cadenceOffers(input)?.map((o) => o.id);

test("cadence_offers_plain_focus_has_no_extend", () => {
  expect(cadenceOffers(FOCUS)).toBeNull();
  expect(ids({ ...FOCUS, checkIn: "Still going" })).toEqual(["takeBreak"]);
});

test("cadence_offers_warning", () => {
  const warning = { ...FOCUS, mode: "warning" as const };
  expect(ids(warning)).toEqual(["extend"]);
  expect(ids({ ...warning, canExtend: false })).toEqual([]);
  expect(ids({ ...warning, checkIn: "Still going" })).toEqual(["takeBreak"]);
});

test("cadence_offers_break", () => {
  const rest = { ...FOCUS, phase: "break" as const, mode: "break" as const };
  expect(cadenceOffers(rest)?.map((o) => [o.id, o.variant])).toEqual([
    ["extend", "quiet"],
    ["skipBreak", "ghost"],
  ]);
  expect(ids({ ...rest, canExtend: false })).toEqual(["skipBreak"]);
  expect(cadenceOffers({ ...rest, state: "idle" })).toBeNull();
});
