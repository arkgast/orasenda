use super::*;
use crate::repo::routines::habits as repo;

fn ids(store: &Store, routine_id: Option<&str>) -> Vec<String> {
    store
        .read(|txn| {
            Ok(repo::list_live(txn, routine_id)?
                .into_iter()
                .map(|h| h.id)
                .collect())
        })
        .expect("lists")
}

fn seeded() -> Store {
    let store = store();
    store
        .write(1_000, |txn| {
            repo::insert(txn, &habit("h2", Some("r1"), 1))?;
            repo::insert(txn, &habit("h1", Some("r1"), 0))?;
            repo::insert(txn, &habit("h3", Some("r1"), 1))?;
            repo::insert(txn, &habit("s1", None, 0))?;
            repo::insert(txn, &habit("x1", Some("r2"), 0))
        })
        .expect("inserts");
    store
}

#[test]
fn habit_insert_logs_every_field() {
    let store = store();
    let new = NewHabit {
        id: "h1".into(),
        routine_id: None,
        position: 0,
        fields: HabitFields {
            name: "Drink a glass of water".into(),
            when_text: Some("at 7:00".into()),
            where_text: Some("in the kitchen".into()),
            anchor: Some("I wake up".into()),
            two_minute: Some("Fill the glass".into()),
            identity: Some("I look after my body".into()),
            optional: true,
            days: Some(31),
        },
    };
    store
        .write(1_000, |txn| repo::insert(txn, &new))
        .expect("inserts");
    assert_eq!(
        logged_fields(&store, "h1"),
        [
            "routine_id",
            "position",
            "name",
            "when_text",
            "where_text",
            "anchor",
            "two_minute",
            "identity",
            "optional",
            "days",
            "created_at"
        ]
    );
    assert!(
        log(&store, "h1")
            .iter()
            .all(|(entity, _, _)| entity == "habit")
    );
    let row = store
        .read(|txn| repo::get(txn, "h1"))
        .expect("reads")
        .expect("row");
    assert_eq!(
        (row.fields, row.routine_id, row.created_at),
        (new.fields, None, 1_000)
    );
}

#[test]
fn habit_list_live_is_per_list_ordered_by_position_then_id() {
    let store = seeded();
    assert_eq!(ids(&store, Some("r1")), ["h1", "h2", "h3"]);
    assert_eq!(ids(&store, None), ["s1"]);
    let all: Vec<String> = store
        .read(|txn| {
            Ok(repo::list_all_live(txn)?
                .into_iter()
                .map(|h| h.id)
                .collect())
        })
        .expect("lists");
    assert_eq!(all, ["s1", "h1", "h2", "h3", "x1"]);
    assert_eq!(
        store
            .read(|txn| repo::next_position(txn, Some("r1")))
            .expect("reads"),
        2
    );
    assert_eq!(
        store
            .read(|txn| repo::next_position(txn, Some("new")))
            .expect("reads"),
        0
    );
}

#[test]
fn habit_list_all_live_skips_habits_of_a_removed_routine() {
    // x1's routine r2 has not arrived yet (a sync may deliver a child first): it stays listed.
    // A live habit under a tombstoned routine (a restore or a merge can make one) does not.
    let store = seeded();
    store
        .write(2_000, |txn| {
            crate::repo::routines::routines::insert(txn, &routine("r1", "Morning", 0))?;
            crate::repo::routines::routines::remove(txn, "r1")?;
            repo::restore(txn, "h1")
        })
        .expect("writes");
    let all: Vec<String> = store
        .read(|txn| {
            Ok(repo::list_all_live(txn)?
                .into_iter()
                .map(|h| h.id)
                .collect())
        })
        .expect("lists");
    assert_eq!(all, ["s1", "x1"]);
}

#[test]
fn habit_checks_refuse_bad_rows() {
    let store = store();
    let mut long_anchor = habit("a", None, 0);
    long_anchor.fields.anchor = Some("x".repeat(121));
    let mut long_when = habit("b", None, 0);
    long_when.fields.when_text = Some("x".repeat(81));
    let mut empty_where = habit("c", None, 0);
    empty_where.fields.where_text = Some(String::new());
    let mut days_in_routine = habit("d", Some("r1"), 0);
    days_in_routine.fields.days = Some(31);
    let mut no_days = habit("e", None, 0);
    no_days.fields.days = Some(0);
    for bad in [
        long_anchor,
        long_when,
        empty_where,
        days_in_routine,
        no_days,
    ] {
        assert!(
            store.write(1, |txn| repo::insert(txn, &bad)).is_err(),
            "{}",
            bad.id
        );
    }
    assert_eq!(log_count(&store), 0);
    let mut fine = habit("f", None, 0);
    fine.fields.anchor = Some("x".repeat(120));
    store
        .write(1, |txn| repo::insert(txn, &fine))
        .expect("120 characters fit");
}

#[test]
fn habit_update_logs_only_changed_fields() {
    let store = seeded();
    let before = log_count(&store);
    let mut fields = fields("Habit h1");
    fields.two_minute = Some("Put on shoes".into());
    fields.optional = true;
    assert!(
        store
            .write(2_000, |txn| repo::update(txn, "h1", &fields))
            .expect("updates")
    );
    assert_eq!(log_count(&store), before + 2);
    let row = store
        .read(|txn| repo::get(txn, "h1"))
        .expect("reads")
        .expect("row");
    assert_eq!((row.fields, row.updated_at), (fields.clone(), 2_000));
    store
        .write(2_500, |txn| repo::remove(txn, "h1"))
        .expect("removes");
    let removed = store
        .write(3_000, |txn| repo::update(txn, "h1", &fields))
        .expect("runs");
    assert!(!removed, "a removed habit is not edited");
}

#[test]
fn habit_move_stays_within_its_list() {
    let store = seeded();
    assert!(
        store
            .write(2_000, |txn| repo::move_to(txn, "h3", 0))
            .expect("moves")
    );
    assert_eq!(ids(&store, Some("r1")), ["h3", "h1", "h2"]);
    assert_eq!(ids(&store, None), ["s1"]);
    let x1 = store
        .read(|txn| repo::get(txn, "x1"))
        .expect("reads")
        .expect("row");
    assert_eq!(
        x1.position, 0,
        "another routine's habits keep their positions"
    );
    assert_eq!(
        logged_fields(&store, "h3").last().map(String::as_str),
        Some("position")
    );
    assert!(
        !store
            .write(2_000, |txn| repo::move_to(txn, "zz", 0))
            .expect("runs")
    );
}

#[test]
fn habit_remove_and_restore_tombstone_and_log() {
    let store = seeded();
    assert!(
        store
            .write(2_000, |txn| repo::remove(txn, "h2"))
            .expect("removes")
    );
    assert_eq!(ids(&store, Some("r1")), ["h1", "h3"]);
    let row = store
        .read(|txn| repo::get(txn, "h2"))
        .expect("reads")
        .expect("row");
    assert_eq!((row.deleted_at, row.updated_at), (Some(2_000), 2_000));
    assert_eq!(
        log(&store, "h2")
            .last()
            .map(|(_, f, v)| (f.clone(), v.clone())),
        Some(("deleted_at".into(), "2000".into()))
    );
    assert!(
        !store
            .write(2_100, |txn| repo::remove(txn, "h2"))
            .expect("runs")
    );
    assert!(
        store
            .write(3_000, |txn| repo::restore(txn, "h2"))
            .expect("restores")
    );
    assert_eq!(ids(&store, Some("r1")), ["h1", "h2", "h3"]);
    assert_eq!(
        log(&store, "h2")
            .last()
            .map(|(_, f, v)| (f.clone(), v.clone())),
        Some(("deleted_at".into(), "null".into()))
    );
    assert!(
        !store
            .write(3_100, |txn| repo::restore(txn, "h2"))
            .expect("runs")
    );
}
