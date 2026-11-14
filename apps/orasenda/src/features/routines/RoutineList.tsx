import { Button, HabitDots, RoutineCard, RoutineItem, WellnessNote } from "@orasenda/ui";
import type { RoutineView_Serialize } from "@shared/ipc/bindings";
import type { ReactElement } from "react";
import { ActionMenu, type MoreAction, moreId, moreItems } from "./ActionMenu";
import { toHabitDays } from "./dots";

type Props = {
  routines: RoutineView_Serialize[];
  /** The routines whose record is open. */
  expanded: ReadonlySet<string>;
  onToggleRecord(id: string): void;
  /** The habit whose grid carries the page's one legend. */
  legendFor: string | null;
  /** Start, once the run view wires it (R8); without it no Start shows. */
  onStart?: (id: string) => void;
  /** The routine whose Start is the page's one primary action. */
  primaryStart: string | null;
  onMore(id: string, index: number, action: MoreAction): void;
  /** A step's own More menu: Edit, Move up, Move down, Remove within its routine. */
  onStepMore(id: string, index: number, action: MoreAction): void;
};

/** The routines as cards: name, time and days, today's line, the steps and the record. */
export function RoutineList(props: Props): ReactElement {
  const { routines } = props;
  return (
    // list-style none makes WebKit drop the list role, so it is stated.
    // biome-ignore lint/a11y/noRedundantRoles: keeps the list role for VoiceOver
    <ul className="app-routines-list" role="list" aria-label="Routines">
      {routines.map((routine, index) => {
        const open = props.expanded.has(routine.id);
        const recordId = `routine-record-${routine.id}`;
        return (
          <li key={routine.id}>
            <RoutineCard
              name={routine.name}
              meta={[routine.time, routine.daysLabel].filter(Boolean).join(" · ")}
              today={routine.today}
              todayLine={routine.todayLine}
              actions={
                <>
                  {props.onStart && routine.today !== "finished" ? (
                    <Button
                      variant={props.primaryStart === routine.id ? "primary" : "quiet"}
                      aria-label={`Start ${routine.name}`}
                      onClick={() => props.onStart?.(routine.id)}
                    >
                      Start
                    </Button>
                  ) : null}
                  <ActionMenu
                    id={moreId(routine.id)}
                    label="More"
                    name={`More for ${routine.name}`}
                    heading={routine.name}
                    items={moreItems(index, routines.length, true)}
                    onSelect={(id) => props.onMore(routine.id, index, id as MoreAction)}
                  />
                </>
              }
              footer={
                routine.wellness ? (
                  <WellnessNote as="p">{routine.note ?? undefined}</WellnessNote>
                ) : undefined
              }
            >
              {routine.habits.length > 0 ? (
                <>
                  {/* biome-ignore lint/a11y/noRedundantRoles: keeps the list role for VoiceOver */}
                  <ol className="app-routines-steps" role="list" aria-label="Steps">
                    {routine.habits.map((habit, at) => (
                      <li key={habit.id} className="app-routines-step">
                        <RoutineItem
                          readOnly
                          label={habit.name}
                          detail={habit.anchorLine ?? undefined}
                          optional={habit.optional}
                        />
                        <ActionMenu
                          id={moreId(habit.id)}
                          label="More"
                          name={`More for ${habit.name}`}
                          heading={habit.name}
                          items={moreItems(at, routine.habits.length)}
                          onSelect={(id) => props.onStepMore(habit.id, at, id as MoreAction)}
                        />
                      </li>
                    ))}
                  </ol>
                  <div>
                    <Button
                      variant="ghost"
                      aria-expanded={open}
                      aria-controls={recordId}
                      onClick={() => props.onToggleRecord(routine.id)}
                    >
                      {open ? "Hide the record" : "Show the record"}
                    </Button>
                  </div>
                  {open ? (
                    <div id={recordId} className="app-routines-record">
                      {routine.habits.map((habit) => (
                        <HabitDots
                          key={habit.id}
                          name={habit.name}
                          columns="week"
                          days={toHabitDays(habit.dots)}
                          runLine={habit.freshStart ? undefined : (habit.runLine ?? undefined)}
                          restartNote={habit.freshStart ?? undefined}
                          legend={props.legendFor === habit.id}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </RoutineCard>
          </li>
        );
      })}
    </ul>
  );
}
