import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  onIntentFieldRequest,
  requestIntentField,
  resetIntentEventsForTests,
} from "./intentEvents";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetIntentEventsForTests();
  vi.useRealTimers();
});

test("intent_request_held_for_the_next_subscriber", async () => {
  requestIntentField();
  const taken = vi.fn(() => true);
  const stop = onIntentFieldRequest(taken);
  await vi.advanceTimersByTimeAsync(0);
  expect(taken).toHaveBeenCalledTimes(1);
  stop();
});

test("intent_request_expires_when_today_does_not_mount", async () => {
  requestIntentField();
  await vi.advanceTimersByTimeAsync(5000);
  const taken = vi.fn(() => true);
  const stop = onIntentFieldRequest(taken);
  await vi.advanceTimersByTimeAsync(0);
  expect(taken).not.toHaveBeenCalled();
  stop();
});

test("intent_reset_clears_listeners_and_the_pending_request", async () => {
  requestIntentField();
  resetIntentEventsForTests();
  const taken = vi.fn(() => true);
  onIntentFieldRequest(taken);
  await vi.advanceTimersByTimeAsync(0);
  expect(taken).not.toHaveBeenCalled();
});
