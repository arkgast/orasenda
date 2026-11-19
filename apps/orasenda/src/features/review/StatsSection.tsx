import {
  BarList,
  BarRow,
  Choice,
  ChoiceGroup,
  HabitDots,
  HabitLegend,
  HabitWeekdays,
  InlineNotice,
  TrendBars,
} from "@orasenda/ui";
import { commands, type StatsRange, type StatsView_Serialize } from "@shared/ipc/bindings";
import { latest, load, save } from "@shared/ipc/settingsQueue";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { habitDays } from "./habitDays";
import { useStats } from "./useStats";

const RANGES: ReadonlyArray<{ range: StatsRange; label: string; caption: string }> = [
  { range: "week", label: "Week", caption: "Focus time by day" },
  { range: "weeks8", label: "8 weeks", caption: "Focus time by week" },
  { range: "months6", label: "6 months", caption: "Focus time by month" },
];

const SAVE_FAILED = "Orasenda couldn't save that right now. Nothing was changed.";

/** "9h 40m", "2h" or "35m": the goal row's number, from the bars Rust sent. */
function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function Shapes({ view }: { view: StatsView_Serialize }): ReactElement {
  const { goal, bars } = view;
  // The caption follows the bars on screen, not the range just picked.
  const caption = RANGES.find((r) => r.range === view.range)?.caption ?? "";
  if (view.range === "week") {
    // A weekly goal has no per-day line: the week's total is a goal row above the day bars.
    const total = bars.reduce((sum, bar) => sum + bar.minutes, 0);
    return (
      <>
        {goal ? (
          <div className="app-review-stats-goal">
            <BarList aria-label="Weekly goal">
              <BarRow
                label="Focus"
                minutes={total}
                max={goal.minutes}
                duration={duration(total)}
                spoken={goal.line}
                goal={{ minutes: goal.minutes, words: goal.words }}
                goalWords="end"
              />
            </BarList>
            <p className="app-review-stats-goal-line" aria-hidden="true">
              {goal.line}
            </p>
          </div>
        ) : null}
        <TrendBars bars={bars} caption={caption} />
      </>
    );
  }
  return (
    <TrendBars
      bars={bars}
      caption={caption}
      goal={goal ? { minutes: goal.minutes, words: goal.words } : undefined}
    />
  );
}

function Lines({ lines, label }: { lines: string[]; label: string }): ReactElement | null {
  if (lines.length === 0) return null;
  return (
    <ul aria-label={label} className="app-review-stats-lines">
      {lines.map((line, index) => (
        // Lines can repeat (two copies of a template), and every read replaces the whole list.
        // biome-ignore lint/suspicious/noArrayIndexKey: no ids in the view; the list is replaced whole
        <li key={`${index}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}

function Habits({ view }: { view: StatsView_Serialize }): ReactElement | null {
  if (view.habits.length === 0) return null;
  // Reviews spec :35, canvas 4A: one sentence per row (it starts with the habit's name),
  // one M–S header over the list and the legend once after it. Dots only come with the Week range; without them a row is its words alone.
  const dotted = view.habits.some((habit) => habit.dots);
  return (
    <div className="app-review-habit-list">
      {dotted ? (
        <div className="app-review-habit-weekdays">
          <HabitWeekdays />
        </div>
      ) : null}
      <ul aria-label="Habits" className="app-review-habits">
        {view.habits.map((habit, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: names are not unique; the list is replaced whole
          <li key={`${index}-${habit.name}`} className="app-review-habit">
            <p className="app-review-habit-line">{habit.line}</p>
            {habit.dots ? (
              <div className="app-review-habit-dots">
                <HabitDots compact name={habit.name} days={habitDays(habit.dots)} columns="week" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {dotted ? <HabitLegend /> : null}
    </div>
  );
}

/** The Stats section: words first, with calm shapes, and the optional buffer suggestion. */
export function StatsSection(): ReactElement {
  const [range, setRange] = useState<StatsRange>("week");
  const { stats, refresh } = useStats(range);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const titleId = useId();
  const groupId = useId();
  const view = stats.view;
  const buffer = view?.buffer ?? null;
  const heading = useRef<HTMLHeadingElement>(null);

  // The save chain builds on the latest settings; have them read if no page has.
  useEffect(() => {
    if (!latest()) load();
  }, []);

  /** After the person's own action, the notice goes; focus waits on the heading, not on body. */
  const done = (): void => {
    heading.current?.focus();
    refresh();
  };

  const chooseBuffer = async (percent: number): Promise<void> => {
    setSaveNote(null);
    const current = latest();
    if (!current) {
      console.error("buffer save: settings are not loaded yet");
      load();
      setSaveNote(SAVE_FAILED);
      return;
    }
    if (await save({ ...current, boardEstimateBuffer: percent })) done();
    else setSaveNote(SAVE_FAILED);
  };

  const notNow = (): void => {
    setSaveNote(null);
    commands.bufferSuggestionDismiss().then(
      (result) => {
        if (result.status === "ok") return done();
        console.error("buffer_suggestion_dismiss failed", result.error);
        setSaveNote(SAVE_FAILED);
      },
      (error: unknown) => {
        console.error("buffer_suggestion_dismiss failed", error);
        setSaveNote(SAVE_FAILED);
      },
    );
  };

  return (
    <section aria-labelledby={titleId} className="app-review-section">
      <div className="app-review-stats">
        <div className="app-review-stats-head">
          <h2 ref={heading} id={titleId} tabIndex={-1} className="app-review-heading">
            Stats
          </h2>
          <ChoiceGroup variant="segmented" labelledBy={groupId}>
            <span id={groupId} className="sr-only">
              Stats range
            </span>
            {RANGES.map((r) => (
              <Choice
                key={r.range}
                name="stats-range"
                value={r.range}
                checked={range === r.range}
                onChange={() => setRange(r.range)}
              >
                {r.label}
              </Choice>
            ))}
          </ChoiceGroup>
        </div>
        {stats.status === "error" ? (
          <InlineNotice
            variant="row"
            tone="attention"
            actionLabel="Try again"
            actionName="Try again loading your stats"
            onAction={refresh}
          >
            <span>
              Orasenda can&apos;t load your stats right now.{" "}
              <span>It&apos;s kept on this Mac.</span>
            </span>
          </InlineNotice>
        ) : null}
        {view ? (
          <>
            <Lines lines={view.summary} label="Summary" />
            <Shapes view={view} />
            <Lines lines={view.routines} label="Routines" />
            <Habits view={view} />
            {view.estimateLine ? (
              <p className="app-review-stats-estimate">{view.estimateLine}</p>
            ) : null}
            {buffer ? (
              <InlineNotice
                actionLabel={buffer.action}
                actionVariant="quiet"
                onAction={() => void chooseBuffer(buffer.percent)}
                secondaryAction={{ label: "Not now", onAction: notNow }}
              >
                {buffer.line}
              </InlineNotice>
            ) : null}
          </>
        ) : null}
        {/* Always mounted, so a line that arrives is announced. */}
        <p role="status" className="app-review-line">
          {saveNote}
        </p>
      </div>
    </section>
  );
}
