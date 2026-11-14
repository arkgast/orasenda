import { HabitDots, RoutineItem } from "@orasenda/ui";
import type { HabitView_Serialize } from "@shared/ipc/bindings";
import { type ReactElement, useId } from "react";
import { ActionMenu, type MoreAction, moreItems } from "./ActionMenu";
import { toHabitDays } from "./dots";

type Props = {
  habits: HabitView_Serialize[];
  /** The habit whose grid carries the page's one legend. */
  legendFor: string | null;
  onCheck(id: string, done: boolean): void;
  onMore(id: string, index: number, action: MoreAction): void;
};

function Habit({
  habit,
  index,
  count,
  legend,
  onCheck,
  onMore,
}: {
  habit: HabitView_Serialize;
  index: number;
  count: number;
  legend: boolean;
  onCheck: Props["onCheck"];
  onMore: Props["onMore"];
}): ReactElement {
  const headingId = useId();
  return (
    <article
      aria-labelledby={headingId} // The same raised ground as a routine card, without the routine edge.
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-raised p-4 shadow-raised wrap-anywhere"
    >
      <div className="app-routines-habit-top">
        <div className="app-routines-habit-name">
          <h3 id={headingId} className="app-routines-habit-heading">
            {habit.name}
          </h3>
          {habit.daysLabel ? <p className="app-routines-muted">{habit.daysLabel}</p> : null}
          <p className="app-routines-muted">{habit.anchorLine ?? habit.intention}</p>
        </div>
        <ActionMenu
          label="More"
          name={`More for ${habit.name}`}
          heading={habit.name}
          items={moreItems(index, count)}
          onSelect={(id) => onMore(habit.id, index, id as MoreAction)}
        />
      </div>
      <RoutineItem
        label="Done today"
        name={`Done today: ${habit.name}`}
        optional={habit.optional}
        done={habit.doneToday}
        onChange={(done) => onCheck(habit.id, done)}
      />
      <HabitDots
        name={habit.name}
        columns="week"
        days={toHabitDays(habit.dots)}
        runLine={habit.freshStart ? undefined : (habit.runLine ?? undefined)}
        restartNote={habit.freshStart ?? undefined}
        legend={legend}
      />
    </article>
  );
}

/** The standalone habits: each with its "Done today" check-in and its dot grid. */
export function HabitList({ habits, legendFor, onCheck, onMore }: Props): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="app-routines-habits">
      <h2 id={headingId} className="app-routines-section-heading">
        Habits
      </h2>
      {/* biome-ignore lint/a11y/noRedundantRoles: keeps the list role for VoiceOver */}
      <ul className="app-routines-list" role="list" aria-label="Habits">
        {habits.map((habit, index) => (
          <li key={habit.id}>
            <Habit
              habit={habit}
              index={index}
              count={habits.length}
              legend={legendFor === habit.id}
              onCheck={onCheck}
              onMore={onMore}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
