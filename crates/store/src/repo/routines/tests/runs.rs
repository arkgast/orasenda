use super::*;
use crate::repo::routines::routine_runs::{self as repo, NewRun, RunOutcome, StepAnswer};

fn new_run(id: &str, routine_id: &str, day: &str, steps: &[&str]) -> NewRun {
    NewRun {
        id: id.into(),
        routine_id: routine_id.into(),
        day: day.into(),
        step_ids: steps.iter().map(|s| (*s).to_owned()).collect(),
    }
}

fn started() -> Store {
    let store = store();
    store
        .write(1_000, |txn| {
            repo::start(txn, &new_run("run1", "r1", "2026-11-14", &["a", "b", "c"]))
        })
        .expect("starts");
    store
}

#[test]
fn run_start_logs_every_field_and_is_open() {
    let store = started();
    assert_eq!(
        logged_fields(&store, "run1"),
        [
            "routine_id",
            "day",
            "started_at",
            "steps_total",
            "steps_done",
            "steps_skipped",
            "step_ids",
            "answers"
        ]
    );
    assert!(
        log(&store, "run1")
            .iter()
            .all(|(entity, _, _)| entity == "routine_run")
    );
    let step_ids = log(&store, "run1")
        .into_iter()
        .find(|(_, f, _)| f == "step_ids");
    assert_eq!(
        step_ids.map(|(_, _, v)| v).as_deref(),
        Some("[\"a\",\"b\",\"c\"]")
    );
    let run = store
        .read(|txn| repo::open_run(txn, "r1"))
        .expect("reads")
        .expect("open");
    assert_eq!(run.id, "run1");
    assert!(run.is_open());
    assert_eq!(
        (run.started_at, run.steps_total, run.outcome),
        (1_000, 3, None)
    );
    assert_eq!(run.step_ids, ["a", "b", "c"]);
    assert_eq!(
        store.read(|txn| repo::open_run(txn, "r2")).expect("reads"),
        None
    );
}

#[test]
fn run_answers_in_order_and_refuses_past_the_last_step() {
    let store = started();
    let after = |at: u64, answer: StepAnswer| {
        store
            .write(at, |txn| repo::answer(txn, "run1", answer))
            .expect("answers")
    };
    let one = after(2_000, StepAnswer::Done).expect("open run");
    assert_eq!(
        (one.steps_done, one.steps_skipped, one.updated_at),
        (1, 0, 2_000)
    );
    after(3_000, StepAnswer::Skipped).expect("open run");
    let three = after(4_000, StepAnswer::Done).expect("open run");
    assert_eq!(
        three.answers,
        [StepAnswer::Done, StepAnswer::Skipped, StepAnswer::Done]
    );
    assert_eq!((three.steps_done, three.steps_skipped), (2, 1));
    let stored = store
        .read(|txn| repo::get(txn, "run1"))
        .expect("reads")
        .expect("row");
    assert_eq!(stored, three, "the returned run is what was stored");
    let tail: Vec<_> = log(&store, "run1")
        .into_iter()
        .rev()
        .take(2)
        .map(|(_, f, v)| (f, v))
        .collect();
    assert_eq!(
        tail,
        [
            (
                "answers".to_owned(),
                "[\"done\",\"skipped\",\"done\"]".to_owned()
            ),
            ("steps_done".to_owned(), "2".to_owned()),
        ]
    );
    let before = log_count(&store);
    assert_eq!(
        after(5_000, StepAnswer::Done),
        None,
        "every step is answered"
    );
    assert_eq!(log_count(&store), before);
}

#[test]
fn run_end_records_outcome_once() {
    let store = started();
    let ended = store
        .write(2_000, |txn| repo::end(txn, "run1", RunOutcome::Stopped))
        .expect("ends")
        .expect("was open");
    assert_eq!(
        (ended.ended_at, ended.outcome),
        (Some(2_000), Some(RunOutcome::Stopped))
    );
    assert!(!ended.is_open());
    let tail: Vec<_> = log(&store, "run1")
        .into_iter()
        .rev()
        .take(2)
        .map(|(_, f, v)| (f, v))
        .collect();
    assert_eq!(
        tail,
        [
            ("outcome".to_owned(), "\"stopped\"".to_owned()),
            ("ended_at".to_owned(), "2000".to_owned()),
        ]
    );
    assert_eq!(
        store.read(|txn| repo::open_run(txn, "r1")).expect("reads"),
        None
    );
    let again = store
        .write(3_000, |txn| repo::end(txn, "run1", RunOutcome::Finished))
        .expect("runs");
    assert_eq!(again, None, "an ended run stays as it ended");
    let late = store
        .write(3_000, |txn| repo::answer(txn, "run1", StepAnswer::Done))
        .expect("runs");
    assert_eq!(late, None, "an ended run takes no answers");
    assert_eq!(
        store
            .write(3_000, |txn| repo::end(txn, "zz", RunOutcome::Stopped))
            .expect("runs"),
        None
    );
}

#[test]
fn run_lists_open_runs_and_runs_on_a_day() {
    let store = started();
    store
        .write(2_000, |txn| {
            repo::start(txn, &new_run("run2", "r2", "2026-11-13", &["x"]))?;
            repo::start(txn, &new_run("run3", "r3", "2026-11-14", &[]))?;
            repo::end(txn, "run3", RunOutcome::Finished)?;
            Ok(())
        })
        .expect("writes");
    let open: Vec<String> = store
        .read(|txn| Ok(repo::list_open(txn)?.into_iter().map(|r| r.id).collect()))
        .expect("reads");
    assert_eq!(open, ["run1", "run2"]);
    let today: Vec<String> = store
        .read(|txn| {
            Ok(repo::runs_on(txn, "2026-11-14")?
                .into_iter()
                .map(|r| r.id)
                .collect())
        })
        .expect("reads");
    assert_eq!(today, ["run1", "run3"]);
}

#[test]
fn run_checks_refuse_inconsistent_rows() {
    let store = started();
    assert!(
        store
            .write(1, |txn| repo::start(
                txn,
                &new_run("bad", "r1", "14 Nov", &["a"])
            ))
            .is_err()
    );
    for sql in [
        // An end without an outcome.
        "UPDATE routine_run SET ended_at = 5 WHERE id = 'run1'",
        // An unknown outcome.
        "UPDATE routine_run SET ended_at = 5, outcome = 'failed' WHERE id = 'run1'",
        // Counts that disagree with the answers.
        "UPDATE routine_run SET steps_done = 1 WHERE id = 'run1'",
        // A total that disagrees with the step list.
        "UPDATE routine_run SET steps_total = 4 WHERE id = 'run1'",
        // Step ids that are not a list.
        "UPDATE routine_run SET step_ids = 'a,b,c' WHERE id = 'run1'",
    ] {
        assert!(sql_fails(&store, sql), "{sql}");
    }
}

fn finished_ids(store: &Store, from: &str, to: &str) -> Vec<String> {
    store
        .read(|txn| {
            Ok(repo::finished_between(txn, from, to)?
                .into_iter()
                .map(|r| r.id)
                .collect())
        })
        .expect("reads")
}

#[test]
fn finished_between_skips_open_and_stopped() {
    let store = store();
    store
        .write(1_000, |txn| {
            for (id, day) in [
                ("open", "2026-11-10"),
                ("stop", "2026-11-10"),
                ("done", "2026-11-10"),
            ] {
                repo::start(txn, &new_run(id, "r1", day, &[]))?;
            }
            repo::end(txn, "stop", RunOutcome::Stopped)?;
            repo::end(txn, "done", RunOutcome::Finished)?;
            Ok(())
        })
        .expect("writes");
    assert_eq!(finished_ids(&store, "2026-11-10", "2026-11-10"), ["done"]);
}

#[test]
fn finished_between_inclusive_days() {
    let store = store();
    store
        .write(1_000, |txn| {
            for (id, day) in [
                ("a", "2026-11-09"),
                ("b", "2026-11-10"),
                ("c", "2026-11-12"),
                ("d", "2026-11-13"),
            ] {
                repo::start(txn, &new_run(id, "r1", day, &[]))?;
                repo::end(txn, id, RunOutcome::Finished)?;
            }
            Ok(())
        })
        .expect("writes");
    assert_eq!(finished_ids(&store, "2026-11-10", "2026-11-12"), ["b", "c"]);
}
