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
    assert_eq!(first, Some(None));
    let second = store
        .write(3_000, |txn| set_frog(txn, "b", day))
        .expect("sets");
    assert_eq!(second, Some(Some("a".to_owned())));
    assert_eq!(get_row(&store, "a").frog_day, None);
    assert_eq!(get_row(&store, "b").frog_day.as_deref(), Some(day));
    assert_eq!(get_row(&store, "a").updated_at, 3_000);
    assert_eq!(log_of(&store, "a").last(), Some(&pair("frog_day", "null")));
    // Setting the current Frog again changes nothing.
    let before = log_len(&store);
    let again = store
        .write(4_000, |txn| set_frog(txn, "b", day))
        .expect("sets");
    assert_eq!(again, Some(None));
    assert_eq!(log_len(&store), before);
    // A different day's Frog is untouched; a missing task is `None` and writes nothing.
    let other = store
        .write(5_000, |txn| set_frog(txn, "a", "2026-11-15"))
        .expect("sets");
    assert_eq!(other, Some(None));
    assert_eq!(get_row(&store, "b").frog_day.as_deref(), Some(day));
    let missing = store.write(6_000, |txn| set_frog(txn, "nope", day));
    assert_eq!(missing.expect("no error"), None);
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

#[test]
fn set_frog_clears_every_other_frog_and_returns_the_newest() {
    let store = store();
    let day = "2026-11-14";
    for (id, rank) in [("a", "V"), ("b", "W"), ("c", "X")] {
        insert_one(&store, &new_task(id, Lane::Today, rank));
    }
    // A merge can leave two Frogs on one day: seed them with different updated_at.
    store
        .write(2_000, |txn| {
            txn.conn().execute(
                "UPDATE task SET frog_day = ?1, updated_at = CASE id WHEN 'a' THEN 1500 ELSE 1800 END
                 WHERE id IN ('a', 'b')",
                [day],
            )?;
            Ok(())
        })
        .expect("seeds");
    let previous = store
        .write(3_000, |txn| set_frog(txn, "c", day))
        .expect("sets");
    assert_eq!(previous, Some(Some("b".to_owned())));
    assert_eq!(get_row(&store, "a").frog_day, None);
    assert_eq!(get_row(&store, "b").frog_day, None);
    assert_eq!(get_row(&store, "c").frog_day.as_deref(), Some(day));
}

#[test]
fn insert_into_done_sets_and_logs_done_at() {
    let store = store();
    insert_one(&store, &new_task("d", Lane::Done, "V"));
    assert_eq!(get_row(&store, "d").done_at, Some(1_000));
    assert!(log_of(&store, "d").iter().any(|(f, _)| f == "done_at"));
    let since = store.read(|txn| list_done_since(txn, 0)).expect("lists");
    assert_eq!(since.len(), 1);
}

#[test]
fn clear_frog_clears_a_frog_and_logs_it() {
    let store = store();
    insert_one(&store, &new_task("a", Lane::Today, "V"));
    store
        .write(2_000, |txn| set_frog(txn, "a", "2026-11-14"))
        .expect("sets");
    assert!(store.write(3_000, |txn| clear_frog(txn, "a")).expect("clears"));
    assert_eq!(get_row(&store, "a").frog_day, None);
    assert_eq!(log_of(&store, "a").last(), Some(&pair("frog_day", "null")));
    assert!(!store.write(4_000, |txn| clear_frog(txn, "a")).expect("no-op"));
    assert!(!store.write(5_000, |txn| clear_frog(txn, "nope")).expect("missing"));
}
