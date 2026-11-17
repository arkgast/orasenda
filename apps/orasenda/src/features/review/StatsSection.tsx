import {
  BarList,
  BarRow,
  Choice,
  ChoiceGroup,
  HabitDots,
  InlineNotice,
  TrendBars,
} from "@orasenda/ui";
import { commands, type StatsRange, type StatsView_Serialize } from "@shared/ipc/bindings";
import { latest, save } from "@shared/ipc/settingsQueue";
import { type ReactElement, useId, useState } from "react";
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

function Shapes({ view, caption }: { view: StatsView_Serialize; caption: string }): ReactElement {
  const { goal, bars } = view;
  if (view.range === "week") {
    // A weekly goal has no per-day line: the week's total is a goal row above the day bars.
    const total = bars.reduce((sum, bar) => sum + bar.minutes, 0);
    return (
      <>
        {goal ? (
          <BarList aria-label="Weekly goal">
            <BarRow
              label="This week"
              minutes={total}
              max={goal.minutes}
              duration={duration(total)}
              spoken={goal.line}
              goal={{ minutes: goal.minutes, words: goal.words }}
            />
          </BarList>
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
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function Habits({ view }: { view: StatsView_Serialize }): ReactElement | null {
  if (view.habits.length === 0) return null;
  // The legend prints once, with the first grid; dots only come with the Week range.
  const first = view.habits.findIndex((habit) => habit.dots);
  return (
    <ul aria-label="Habits" className="app-review-habits">
      {view.habits.map((habit, index) => (
        <li key={habit.name}>
          {habit.dots ? (
            <HabitDots
              name={habit.name}
              days={habitDays(habit.dots)}
              runLine={habit.line}
              columns="week"
              legend={index === first}
            />
          ) : (
            <>
              <p className="app-review-habit-name">{habit.name}</p>
              <p className="app-review-line">{habit.line}</p>
            </>
          )}
        </li>
      ))}
    </ul>
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
  const caption = RANGES.find((r) => r.range === range)?.caption ?? "";

  const chooseBuffer = async (percent: number): Promise<void> => {
    setSaveNote(null);
    // The save chain builds on the latest settings; read them once if Today has not.
    const current = latest() ?? (await commands.settingsGet().catch(() => null));
    const worked = current ? await save({ ...current, boardEstimateBuffer: percent }) : false;
    if (worked) refresh();
    else setSaveNote(SAVE_FAILED);
  };

  const notNow = (): void => {
    setSaveNote(null);
    commands.bufferSuggestionDismiss().then(
      (result) => {
        if (result.status === "ok") return refresh();
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
      <h2 id={titleId} className="app-review-heading">
        Stats
      </h2>
      <div className="app-review-stats">
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
            {view.empty ? <p className="app-review-line">{view.empty}</p> : null}
            <Shapes view={view} caption={caption} />
            <Lines lines={view.routines} label="Routines" />
            <Habits view={view} />
            {view.estimateLine ? <p className="app-review-line">{view.estimateLine}</p> : null}
            {view.buffer ? (
              <InlineNotice
                actionLabel={view.buffer.action}
                onAction={() => void chooseBuffer(view.buffer?.percent ?? 0)}
                secondaryAction={{ label: "Not now", onAction: notNow }}
              >
                {view.buffer.line}
              </InlineNotice>
            ) : null}
            {saveNote ? (
              <p role="status" className="app-review-line">
                {saveNote}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
