import { mockIPC } from "@tauri-apps/api/mocks";

/** One backend command the UI sent, with its arguments. */
export type Call = { cmd: string; args: unknown };

/** Replies for the mocked backend, keyed by command name; a missing command throws. */
export type Replies = Record<string, (args: unknown) => unknown>;

type Invoke = (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;

/**
 * Installs `mockIPC` with event mocking and records every non-event command in the returned
 * array; `failListen` makes listening to that event reject. Tests unmount before
 * `clearMocks()`: the event mock in @tauri-apps/api 2.12.4 never removes a listener on unlisten
 * (docs/common-issues.md).
 */
export function mockBackend(
  replies: Replies,
  { failListen }: { failListen?: string } = {},
): Call[] {
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
  if (failListen !== undefined) {
    // mockIPC installs this on a global that @tauri-apps/api doesn't type.
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } })
      .__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = async (cmd, args, options) => {
      const event = (args as { event?: string } | undefined)?.event;
      if (cmd === "plugin:event|listen" && event === failListen) {
        throw new Error("core:event:allow-listen not granted");
      }
      return invoke(cmd, args, options);
    };
  }
  return calls;
}

/** The arguments of every call to `cmd`, in order. */
export function argsOf(calls: Call[], cmd: string): unknown[] {
  return calls.filter((call) => call.cmd === cmd).map((call) => call.args);
}
