//! The look-back: the week before the planned one, in words and small bars. Nothing here
//! scores or compares; a reflection is echoed as the person's own words and never counted.

use orasenda_core::LocalDate;
use orasenda_core::review::{StatsRange, days_done};
use orasenda_store::reflections::{self, ReflectionKind, ReflectionRow};
use orasenda_store::{StoreError, Txn, focus_sessions, tasks};

use super::super::stats::{HabitDays, Parts, estimate_line, local_start_ms, shift};
use super::super::words;
use crate::api::{BarView, GoalView, LookBack, ReflectionEcho};
use crate::review::stats_parts;

const MINUTE_MS: u64 = 60_000;
/// Tasks shown, most focus first.
const TOP_TASKS: usize = 5;

/// The look-back over `from..=to` (a Monday and the Sunday after it).
pub(super) fn build(
    txn: &Txn,
    (today, offset_min): (LocalDate, i32),
    (from, to): (LocalDate, LocalDate),
    goal_minutes: u32,
) -> Result<LookBack, StoreError> {
    let parts = stats_parts(txn, from, to, offset_min)?;
    let days = day_bars(&parts, from, today);
    let minutes: u32 = days.iter().map(|day| day.minutes).sum();
    let sessions = u32::try_from(parts.sessions.len()).unwrap_or(u32::MAX);
    Ok(LookBack {
        heading: words::look_back_heading(from, to),
        focus_line: words::focus_line(minutes, sessions),
        days,
        goal: goal(minutes, goal_minutes),
        tasks: task_bars(txn, from, to, offset_min)?,
        tasks_line: words::tasks_line(u32::try_from(parts.done_tasks.len()).unwrap_or(u32::MAX)),
        routine_lines: parts
            .routines
            .iter()
            .map(|(name, finished)| words::routine_line(name, *finished))
            .collect(),
        habit_lines: parts
            .habits
            .iter()
            .map(|habit| habit_line(habit, from, to))
            .collect(),
        estimate_line: estimate_line(&parts.estimated),
        reflections: echoes(txn, from, to)?,
    })
}

/// A bar a day, Monday to Sunday. A day after today is empty, as is one with no focus.
fn day_bars(parts: &Parts, from: LocalDate, today: LocalDate) -> Vec<BarView> {
    (0..7)
        .map(|offset| {
            let day = shift(from, offset);
            let ms: u64 = parts
                .sessions
                .iter()
                .filter(|session| session.date == day)
                .map(|session| session.focused_ms)
                .sum();
            let minutes = u32::try_from(ms / MINUTE_MS).unwrap_or(u32::MAX);
            BarView {
                label: day.weekday().short().to_owned(),
                spoken: words::bar_spoken(StatsRange::Week, day, minutes),
                minutes,
                duration: duration(minutes),
                current: day == today,
                empty: minutes == 0 || day > today,
            }
        })
        .collect()
}

fn duration(minutes: u32) -> String {
    if minutes == 0 {
        String::new()
    } else {
        words::duration(minutes)
    }
}

fn goal(minutes: u32, goal_minutes: u32) -> Option<GoalView> {
    Some(GoalView {
        minutes: goal_minutes,
        words: words::goal_words(minutes, goal_minutes)?,
        line: words::goal_line(minutes, goal_minutes)?,
    })
}

/// The five live tasks with the most focus time in the range. A removed task is left out, and
/// so is one with under a minute.
fn task_bars(
    txn: &Txn,
    from: LocalDate,
    to: LocalDate,
    offset_min: i32,
) -> Result<Vec<BarView>, StoreError> {
    let found = focus_sessions::focused_by_task(
        txn,
        local_start_ms(from, offset_min),
        local_start_ms(to.succ(), offset_min),
    )?;
    let mut bars = Vec::new();
    for (id, ms) in found {
        let minutes = u32::try_from(ms / MINUTE_MS).unwrap_or(u32::MAX);
        let Some(task) = tasks::get(txn, &id)?.filter(|task| task.deleted_at.is_none()) else {
            continue;
        };
        if minutes == 0 {
            continue;
        }
        bars.push(BarView {
            spoken: words::task_spoken(&task.title, minutes),
            label: task.title,
            minutes,
            duration: duration(minutes),
            current: false,
            empty: false,
        });
        if bars.len() == TOP_TASKS {
            break;
        }
    }
    Ok(bars)
}

fn habit_line(habit: &HabitDays, from: LocalDate, to: LocalDate) -> String {
    let done: Vec<LocalDate> = habit.done.iter().copied().collect();
    let (days, since) = days_done(habit.created, from, to, &done);
    words::habit_line(days, since, StatsRange::Week)
}

/// The shutdown answers saved for the range, by day, as the person wrote them. A day with no
/// answers is left out; nothing is counted or summarised.
fn echoes(txn: &Txn, from: LocalDate, to: LocalDate) -> Result<Vec<ReflectionEcho>, StoreError> {
    let rows = reflections::list(txn, ReflectionKind::Shutdown, &from.to_iso(), &to.to_iso())?;
    Ok(rows.iter().filter_map(echo).collect())
}

fn echo(row: &ReflectionRow) -> Option<ReflectionEcho> {
    let day = LocalDate::parse_iso(&row.period)?;
    let lines: Vec<String> = [&row.went_well, &row.to_improve, &row.outside_control]
        .into_iter()
        .flatten()
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .collect();
    (!lines.is_empty()).then(|| ReflectionEcho {
        day_label: words::day_label(day),
        lines,
    })
}
