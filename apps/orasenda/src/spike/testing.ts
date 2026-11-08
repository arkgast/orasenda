import { mockIPC } from "@tauri-apps/api/mocks";

/** One backend command the UI sent, with its arguments. */
export type Call = { cmd: string; args: unknown };

/** Replies for the mocked backend, keyed by command name; a missing command throws. */
export type Replies = Record<string, (args: unknown) => unknown>;

/**
 * Installs `mockIPC` with event mocking and records every non-event command in the returned
 * array. Tests unmount before `clearMocks()`: the event mock in @tauri-apps/api 2.12.4 never
 * removes a listener on unlisten (docs/common-issues.md).
 */
export function mockBackend(replies: Replies): Call[] {
  const calls: Call[] = [];
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      const reply = replies[cmd];
      if (!reply) throw new Error(`unexpected command ${cmd}`);
      return reply(args);
    },
    { shouldMockEvents: true },
  );
  return calls;
}

/** The arguments of every call to `cmd`, in order. */
export function argsOf(calls: Call[], cmd: string): unknown[] {
  return calls.filter((call) => call.cmd === cmd).map((call) => call.args);
}
