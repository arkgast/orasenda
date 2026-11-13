import { BREAK, IDLE, RUNNING } from "@shared/test/fixtures";
import { expect, test, vi } from "vitest";
import { statusLine } from "../today/statusLine";
import { cadenceActions } from "./cadenceActions";

const handlers = {
  extend: vi.fn(),
  takeBreak: vi.fn(),
  skipBreak: vi.fn(),
  keepGoing: vi.fn(),
  stopHere: vi.fn(),
};
const ids = (view: Parameters<typeof cadenceActions>[0]) =>
  cadenceActions(view, handlers, null).map((a) => a.id);
const WARNING = { ...RUNNING, mode: "warning" as const, canExtend: true };

test("focus_plain_hides_extend_before_warning", () => {
  expect(ids({ ...RUNNING, canExtend: true })).toEqual([]);
});

test("focus_warning_matches_today", () => {
  const today = (view: typeof RUNNING) =>
    statusLine({
      startError: false,
      controlError: false,
      timerUnavailable: false,
      notice: null,
      store: "ok",
      cadence: view,
    })?.actions.map((a) => a.id);
  for (const view of [
    WARNING,
    { ...WARNING, canExtend: false },
    { ...WARNING, checkIn: "Still going · ends 15:40" },
  ]) {
    expect(ids(view)).toEqual(today(view) ?? []);
  }
  expect(ids(WARNING)).toEqual(["extend"]);
  expect(ids({ ...WARNING, checkIn: "Still going" })).toEqual(["takeBreak"]);
  const [extend] = cadenceActions(WARNING, handlers, null);
  expect(extend?.name).toBe("Add 10 minutes of focus");
});

test("focus_break_offers_extend_and_skip", () => {
  const actions = cadenceActions({ ...BREAK, canExtend: true }, handlers, null);
  expect(actions.map((a) => a.id)).toEqual(["extend", "skipBreak"]);
  expect(actions[0]?.name).toBe("Back to focus for 10 more minutes");
});

test("break_without_extend_only_skip", () => {
  expect(ids({ ...BREAK, canExtend: false })).toEqual(["skipBreak"]);
});

test("focus_offer_unchanged", () => {
  expect(ids({ ...IDLE, offer: "keepGoing" })).toEqual(["keepGoing", "stopHere"]);
  expect(ids(IDLE)).toEqual([]);
});
