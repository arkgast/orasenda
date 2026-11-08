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
import { subscribe } from "../subscribe";

/** Which of the last requests failed; each resets on that request's next success. */
export type SpikeErrors = { apps: boolean; usage: boolean; rule: boolean; ruleRead: boolean };

/** A new rule, or a change to the latest requested one (so fast changes build on each other). */
export type RuleChange = BlockRule | ((latest: BlockRule) => BlockRule);

export type Spike = {
  /** `null` until `spike_status` answers (and when it could not be asked). */
  status: SpikeStatus | null;
  apps: AppRef[];
  /** The rule last accepted by the backend. */
  rule: BlockRule;
  /** Newest first, at most 20. */
  usage: UsageSegment[];
  errors: SpikeErrors;
  setRule(rule: RuleChange): Promise<void>;
  refreshApps(): Promise<void>;
};

/** The backend's `BlockRule::default()`: what the panel shows until `spike_rule` answers. */
const DEFAULT_RULE: BlockRule = { targets: [], action: "hide" };

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: SpikeError };
type Outcome<T> = { ok: true; data: T } | { ok: false };

/** Runs a spike command; a failure is logged to `console.error`. */
async function run<T>(name: string, command: () => Promise<Result<T>>): Promise<Outcome<T>> {
  try {
    const result = await command();
    if (result.status === "ok") return { ok: true, data: result.data };
    console.error(`${name} failed`, result.error);
  } catch (error: unknown) {
    console.error(`${name} failed`, error);
  }
  return { ok: false };
}

/**
 * State for the spike's dev panel. Asks `spike_status` on mount; only when the spike is enabled
 * does it read the backend rule, load the running apps and usage, and refetch usage on every `spike-usage-changed`.
 */
export function useSpike(): Spike {
  const [status, setStatus] = useState<SpikeStatus | null>(null);
  const [apps, setApps] = useState<AppRef[]>([]);
  const [rule, setAcceptedRule] = useState<BlockRule>(DEFAULT_RULE);
  const [usage, setUsage] = useState<UsageSegment[]>([]);
  const [errors, setErrors] = useState<SpikeErrors>({
    apps: false,
    usage: false,
    rule: false,
    ruleRead: false,
  });
  const mounted = useRef(false);
  const accepted = useRef<BlockRule>(DEFAULT_RULE);
  const requested = useRef<BlockRule>(DEFAULT_RULE);

  const setError = useCallback((key: keyof SpikeErrors, failed: boolean) => {
    if (mounted.current) setErrors((current) => ({ ...current, [key]: failed }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    commands.spikeStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      // `spike_status` never errors, so this is the IPC itself; the panel stays away.
      (error: unknown) => console.error("spike_status failed", error),
    );
    return () => {
      mounted.current = false;
      cancelled = true;
    };
  }, []);

  const refreshApps = useCallback(async () => {
    const outcome = await run("spike_running_apps", () => commands.spikeRunningApps());
    if (outcome.ok && mounted.current) setApps(outcome.data);
    setError("apps", !outcome.ok);
  }, [setError]);

  const setRule = useCallback(
    async (change: RuleChange) => {
      const next = typeof change === "function" ? change(requested.current) : change;
      requested.current = next;
      const outcome = await run("spike_set_rule", () => commands.spikeSetRule(next));
      if (outcome.ok) {
        accepted.current = next;
        if (mounted.current) setAcceptedRule(next);
      } else if (requested.current === next) {
        // Nothing newer was asked for: build the next change on what the backend has.
        requested.current = accepted.current;
      }
      setError("rule", !outcome.ok);
      if (outcome.ok) setError("ruleRead", false);
    },
    [setError],
  );

  const enabled = status?.enabled === true;

  useEffect(() => {
    if (!enabled) return;
    const initial = requested.current;
    void run("spike_rule", () => commands.spikeRule()).then((outcome) => {
      // A change made before the read answered wins over it.
      if (!outcome.ok) {
        setError("ruleRead", true);
        return;
      }
      if (!mounted.current || requested.current !== initial) return;
      requested.current = outcome.data;
      accepted.current = outcome.data;
      setAcceptedRule(outcome.data);
    });
  }, [enabled, setError]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refreshUsage = async () => {
      const outcome = await run("spike_usage", () => commands.spikeUsage());
      if (cancelled) return;
      if (outcome.ok) setUsage(outcome.data);
      setError("usage", !outcome.ok);
    };
    void refreshApps();
    void refreshUsage();
    const unsubscribe = subscribe("spike-usage-changed", events.spikeUsageChanged.listen, () => {
      void refreshUsage();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, refreshApps, setError]);

  return { status, apps, rule, usage, errors, setRule, refreshApps };
}
