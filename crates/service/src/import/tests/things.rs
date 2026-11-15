use crate::import::things::parse;

const BASIC: &str = include_str!("fixtures/things_basic.json");

#[test]
fn things_fixture_maps_tags_and_dates() {
    let items = parse(BASIC).expect("parses");
    assert_eq!(items.len(), 2);
    // Ordered by project or area: "Home" before "Work".
    let book = &items[0];
    assert_eq!(book.origin, "things:C3d4");
    assert_eq!(book.title, "Book dentist");
    assert_eq!(book.tags, ["Home"]);
    assert_eq!(book.due, None);
    assert_eq!(book.date_lines, ["When in Things: 2026-11-18"]);
    assert_eq!(book.priority, None);
    assert!(book.checklist.is_empty());
    let plan = &items[1];
    assert_eq!(plan.origin, "things:A1b2");
    assert_eq!(plan.notes, "Outline first");
    assert_eq!(plan.tags, ["Work", "planning", "q1"]);
    assert_eq!(plan.due.as_deref(), Some("2026-11-20"));
    assert!(plan.date_lines.is_empty());
}

#[test]
fn things_comma_tags_split() {
    let json = r#"[{"id":"x","name":"T","notes":"","project":null,"area":null,
        "tagNames":" a ,b,, c ","dueDate":null,"activationDate":null}]"#;
    let items = parse(json).expect("parses");
    assert_eq!(items[0].tags, ["a", "b", "c"]);
}

#[test]
fn things_order_is_stable_by_project_then_index() {
    let json = r#"[
      {"id":"1","name":"a","notes":"","project":"Z","area":null,"tagNames":"","dueDate":null,"activationDate":null},
      {"id":"2","name":"b","notes":"","project":null,"area":"A","tagNames":"","dueDate":null,"activationDate":null},
      {"id":"3","name":"c","notes":"","project":"Z","area":null,"tagNames":"","dueDate":null,"activationDate":null}]"#;
    let order: Vec<String> = parse(json)
        .expect("parses")
        .into_iter()
        .map(|r| r.origin)
        .collect();
    assert_eq!(order, ["things:2", "things:1", "things:3"]);
}

#[test]
fn things_does_not_filter_and_refuses_bad_json() {
    let json = r#"[{"id":"1","name":"","notes":"","project":null,"area":null,"tagNames":"","dueDate":"someday","activationDate":null}]"#;
    let items = parse(json).expect("parses");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].due, None);
    assert_eq!(items[0].date_lines, ["Things deadline: someday"]);
    assert!(parse("not json").is_err());
    assert!(parse(r#"{"id":1}"#).is_err());
}
