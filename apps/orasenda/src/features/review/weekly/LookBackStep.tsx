import { BarList, BarRow, ScrollRegion, TrendBars } from "@orasenda/ui";
import type { WeeklyView_Serialize } from "@shared/ipc/bindings";
import type { ReactElement } from "react";

type Props = { view: WeeklyView_Serialize };

/**
 * Step 1: the week just worked, read-only. Last week's improvement comes first, in the person's
 * own words. Every number is also a sentence Rust worded; the shapes only repeat them.
 */
export function LookBackStep({ view }: Props): ReactElement {
  const { lookBack } = view;
  const total = lookBack.days.reduce((sum, day) => sum + day.minutes, 0);
  const longest = Math.max(0, ...lookBack.tasks.map((task) => task.minutes));
  const { goal } = lookBack;
  return (
    <ScrollRegion label="Look back">
      <div className="app-shutdown-body">
        {view.lastImprovement ? <p className="app-review-label">{view.lastImprovement}</p> : null}
        <p className="app-review-label">{lookBack.heading}</p>
        <p className="app-review-line">{lookBack.focusLine}</p>
        <TrendBars bars={lookBack.days} caption="Focus time by day" />
        {goal ? (
          <>
            <BarList aria-label="Focus goal">
              <BarRow
                label="Focus"
                minutes={total}
                max={total}
                duration=""
                spoken={goal.line}
                goal={{ minutes: goal.minutes, words: goal.words }}
              />
            </BarList>
            <p className="app-review-line" aria-hidden="true">
              {goal.line}
            </p>
          </>
        ) : null}
        {lookBack.tasks.length > 0 ? (
          <>
            <h2 className="app-review-heading">Focus by task</h2>
            <BarList aria-label="Focus time by task">
              {lookBack.tasks.map((task) => (
                <BarRow
                  key={`${task.label}-${task.spoken}`}
                  label={task.label}
                  minutes={task.minutes}
                  max={longest}
                  duration={task.duration}
                  spoken={task.spoken}
                />
              ))}
            </BarList>
          </>
        ) : null}
        <p className="app-review-line">{lookBack.tasksLine}</p>
        <Lines lines={lookBack.routineLines} />
        <Lines lines={lookBack.habitLines} />
        {lookBack.estimateLine ? <p className="app-review-line">{lookBack.estimateLine}</p> : null}
        {lookBack.reflections.length > 0 ? (
          <>
            <h2 className="app-review-heading">Your shutdown notes</h2>
            {lookBack.reflections.map((echo) => (
              <div key={echo.dayLabel} className="app-weekly-echo">
                <p className="app-review-label">{echo.dayLabel}</p>
                <Lines lines={echo.lines} />
              </div>
            ))}
          </>
        ) : null}
      </div>
    </ScrollRegion>
  );
}

function Lines({ lines }: { lines: string[] }): ReactElement | null {
  if (lines.length === 0) return null;
  return (
    <ul className="app-shutdown-lines">
      {lines.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
