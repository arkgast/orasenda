use super::*;

fn pair(field: &str, value: &str) -> (String, String) {
    (field.to_owned(), value.to_owned())
}

#[test]
fn insert_logs_every_field() {
    let store = store();
    let mut task = new_task("t1", Lane::Today, "V");
    task.notes = "n".into();
    task.tags = vec!["a".into(), "b".into()];
    task.estimate = Some(3);
    task.due = Some("2026-11-20".into());
    task.priority = Some(Priority::High);
    task.checklist = vec![ChecklistItem {
        id: "c1".into(),
        text: "step".into(),
        done: false,
    }];
    task.frog_day = Some("2026-11-14".into());
    task.source_note_id = Some("note1".into());
    insert_one(&store, &task);
    let fields: Vec<String> = log_of(&store, "t1").into_iter().map(|(f, _)| f).collect();
    assert_eq!(
        fields,
        [
            "title",
            "notes",
            "tags",
            "kind",
            "estimate",
            "due",
            "priority",
            "checklist",
            "lane",
            "rank",
            "frog_day",
            "breakdown_dismissed",
            "source_note_id",
            "created_at"
        ]
    );
    let log = log_of(&store, "t1");
    assert_eq!(log[2], pair("tags", "[\"a\",\"b\"]"));
    assert_eq!(
        log[7],
        pair(
            "checklist",
            "[{\"done\":false,\"id\":\"c1\",\"text\":\"step\"}]"
        )
    );
    let row = get_row(&store, "t1");
    assert_eq!(row.tags, ["a", "b"]);
    assert_eq!(row.estimate, Some(3));
    assert_eq!(row.priority, Some(Priority::High));
    assert_eq!(row.lane, Lane::Today);
    assert_eq!((row.created_at, row.updated_at), (500, 1_000));
    assert_eq!((row.done_at, row.deleted_at), (None, None));
}

#[test]
fn update_logs_only_changed_fields() {
    let store = store();
    insert_one(&store, &new_task("t1", Lane::Backlog, "V"));
    let before = log_len(&store);
    let patch = TaskPatch {
        title: Some("Renamed".into()),
        notes: Some(String::new()), // unchanged
        estimate: Some(Some(2)),
        priority: Some(None), // unchanged
        ..TaskPatch::default()
    };
    let changed = store
        .write(2_000, |txn| update(txn, "t1", &patch))
        .expect("updates");
    assert!(changed);
    assert_eq!(log_len(&store) - before, 2);
    let log = log_of(&store, "t1");
    assert_eq!(
        &log[log.len() - 2..],
        [pair("title", "\"Renamed\""), pair("estimate", "2")]
    );
    let row = get_row(&store, "t1");
    assert_eq!(
        (row.title.as_str(), row.estimate, row.updated_at),
        ("Renamed", Some(2), 2_000)
    );
}

#[test]
fn update_with_no_change_writes_nothing() {
    let store = store();
    insert_one(&store, &new_task("t1", Lane::Backlog, "V"));
    let before = log_len(&store);
    let patch = TaskPatch {
        title: Some("Task t1".into()),
        ..TaskPatch::default()
    };
    let changed = store
        .write(2_000, |txn| update(txn, "t1", &patch))
        .expect("updates");
    assert!(!changed);
    assert_eq!(log_len(&store), before);
    assert_eq!(get_row(&store, "t1").updated_at, 1_000);
    let missing = store
        .write(2_000, |txn| update(txn, "nope", &patch))
        .expect("updates");
    assert!(!missing);
}

#[test]
fn move_to_done_sets_done_at_and_leaving_clears_it() {
    let store = store();
    insert_one(&store, &new_task("t1", Lane::Doing, "V"));
    assert!(
        store
            .write(3_000, |txn| move_to(txn, "t1", Lane::Done, "W"))
            .expect("moves")
    );
    let row = get_row(&store, "t1");
    assert_eq!(
        (row.lane, row.rank.as_str(), row.done_at),
        (Lane::Done, "W", Some(3_000))
    );
    let log = log_of(&store, "t1");
    assert_eq!(
        &log[log.len() - 3..],
        [
            pair("lane", "\"done\""),
            pair("rank", "\"W\""),
            pair("done_at", "3000")
        ]
    );
    // Reordering inside Done keeps the first done_at.
    assert!(
        store
            .write(4_000, |txn| move_to(txn, "t1", Lane::Done, "X"))
            .expect("moves")
    );
    assert_eq!(get_row(&store, "t1").done_at, Some(3_000));
    // Leaving Done clears it.
    assert!(
        store
            .write(5_000, |txn| move_to(txn, "t1", Lane::Today, "X"))
            .expect("moves")
    );
    let row = get_row(&store, "t1");
    assert_eq!((row.lane, row.done_at), (Lane::Today, None));
    let log = log_of(&store, "t1");
    assert_eq!(log.last(), Some(&pair("done_at", "null")));
    // Same place again: nothing.
    let before = log_len(&store);
    assert!(
        !store
            .write(6_000, |txn| move_to(txn, "t1", Lane::Today, "X"))
            .expect("moves")
    );
    assert_eq!(log_len(&store), before);
}

#[test]
fn set_frog_moves_the_flag() {
    let store = store();
    insert_one(&store, &new_task("a", Lane::Today, "V"));
    insert_one(&store, &new_task("b", Lane::Today, "W"));
    let day = "2026-11-14";
    let first = store
        .write(2_000, |txn| set_frog(txn, "a", day))
        .expect("sets");
    assert_eq!(first, None);
    let second = store
        .write(3_000, |txn| set_frog(txn, "b", day))
        .expect("sets");
    assert_eq!(second.as_deref(), Some("a"));
    assert_eq!(get_row(&store, "a").frog_day, None);
    assert_eq!(get_row(&store, "b").frog_day.as_deref(), Some(day));
    assert_eq!(get_row(&store, "a").updated_at, 3_000);
    assert_eq!(log_of(&store, "a").last(), Some(&pair("frog_day", "null")));
    // Setting the current Frog again changes nothing.
    let before = log_len(&store);
    let again = store
        .write(4_000, |txn| set_frog(txn, "b", day))
        .expect("sets");
    assert_eq!(again, None);
    assert_eq!(log_len(&store), before);
    // A different day's Frog is untouched; a missing task is an error and writes nothing.
    let other = store
        .write(5_000, |txn| set_frog(txn, "a", "2026-11-15"))
        .expect("sets");
    assert_eq!(other, None);
    assert_eq!(get_row(&store, "b").frog_day.as_deref(), Some(day));
    let missing = store.write(6_000, |txn| set_frog(txn, "nope", day));
    assert!(missing.is_err());
    assert_eq!(get_row(&store, "b").frog_day.as_deref(), Some(day));
}

#[test]
fn remove_and_restore() {
    let store = store();
    insert_one(&store, &new_task("t1", Lane::Today, "V"));
    insert_one(&store, &new_task("t2", Lane::Today, "W"));
    assert!(
        store
            .write(2_000, |txn| remove(txn, "t1", 2_000))
            .expect("removes")
    );
    let live = store.read(list_live).expect("lists");
    assert_eq!(
        live.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
        ["t2"]
    );
    let row = get_row(&store, "t1");
    assert_eq!((row.deleted_at, row.updated_at), (Some(2_000), 2_000));
    assert!(
        !store
            .write(3_000, |txn| remove(txn, "t1", 3_000))
            .expect("removes")
    );
    // A removed task takes no update.
    let patch = TaskPatch {
        title: Some("x".into()),
        ..TaskPatch::default()
    };
    assert!(
        !store
            .write(3_000, |txn| update(txn, "t1", &patch))
            .expect("updates")
    );
    assert!(
        store
            .write(4_000, |txn| restore(txn, "t1"))
            .expect("restores")
    );
    assert!(
        !store
            .write(5_000, |txn| restore(txn, "t1"))
            .expect("restores")
    );
    assert_eq!(store.read(list_live).expect("lists").len(), 2);
    assert_eq!(get_row(&store, "t1").deleted_at, None);
    let log = log_of(&store, "t1");
    assert_eq!(
        &log[log.len() - 2..],
        [pair("deleted_at", "2000"), pair("deleted_at", "null")]
    );
}
