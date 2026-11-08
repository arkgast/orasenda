import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppRef,
  type BlockRule,
  commands,
  events,
  type SpikeError,
  type SpikeStatus,
  type UsageSegment,
} from "../bindings";

export type Spike = {
  /** `null` until `spike_status` answers (and when it could not be asked). */
  status: SpikeStatus | null;
  apps: AppRef[];
  /** The rule last accepted by the backend. */
  rule: BlockRule;
  /** Newest first, at most 20. */
  usage: UsageSegment[];
  setRule(rule: BlockRule): Promise<void>;
  refreshApps(): Promise<void>;
};

/** The backend's `BlockRule::default()`; the rule only lives in memory, so it starts here. */
const DEFAULT_RULE: BlockRule = { targets: [], action: "hide" };

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: SpikeError };

/** Runs a spike command: its data, or `undefined` after logging why it failed. */
async function run<T>(name: string, command: () => Promise<Result<T>>): Promise<T | undefined> {
  try {
    const result = await command();
    if (result.status === "ok") return result.data;
    console.error(`${name} failed`, result.error);
  } catch (error: unknown) {
    console.error(`${name} failed`, error);
  }
  return undefined;
}

/**
 * State for the spike's dev panel. Asks `spike_status` on mount; only when the spike is enabled
 * does it load the running apps and usage, and refetch usage on every `spike-usage-changed`.
 */
export function useSpike(): Spike {
  const [status, setStatus] = useState<SpikeStatus | null>(null);
  const [apps, setApps] = useState<AppRef[]>([]);
  const [rule, setRuleState] = useState<BlockRule>(DEFAULT_RULE);
  const [usage, setUsage] = useState<UsageSegment[]>([]);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    commands.spikeStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      // `spike_status` never errors, so this is the IPC itself; the panel just stays away.
      (error: unknown) => console.warn("spike_status failed", error),
    );
    return () => {
      mounted.current = false;
      cancelled = true;
    };
  }, []);

  const refreshApps = useCallback(async () => {
    const next = await run("spike_running_apps", () => commands.spikeRunningApps());
    if (next && mounted.current) setApps(next);
  }, []);

  const setRule = useCallback(async (next: BlockRule) => {
    // `spike_set_rule` answers `null` when it took the rule.
    const accepted = await run("spike_set_rule", () => commands.spikeSetRule(next));
    if (accepted === null && mounted.current) setRuleState(next);
  }, []);

  const enabled = status?.enabled === true;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refreshUsage = async () => {
      const next = await run("spike_usage", () => commands.spikeUsage());
      if (next && !cancelled) setUsage(next);
    };
    void refreshApps();
    void refreshUsage();
    const listening = events.spikeUsageChanged.listen(() => {
      if (!cancelled) void refreshUsage();
    });
    listening.catch((error: unknown) => console.error("spike-usage-changed listen failed", error));
    return () => {
      cancelled = true;
      listening.then(
        // `UnlistenFn` is typed `() => void` but returns a promise at runtime.
        (unlisten) =>
          Promise.resolve(unlisten()).catch((error: unknown) =>
            console.error("spike-usage-changed unlisten failed", error),
          ),
        // Already logged above; there is nothing to unlisten.
        () => {},
      );
    };
  }, [enabled, refreshApps]);

  return { status, apps, rule, usage, setRule, refreshApps };
}
