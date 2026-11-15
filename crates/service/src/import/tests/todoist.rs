use std::collections::HashMap;
use std::path::PathBuf;

use crate::api::TaskPriority;
use crate::import::origin;
use crate::import::todoist::{ParseError, parse_csv, parse_file, project_name};

/// A scratch directory under the system temp dir, removed on drop.
pub(super) struct Scratch(pub(super) PathBuf);

impl Scratch {
    pub(super) fn new(name: &str) -> Self {
        let dir =
            std::env::temp_dir().join(format!("orasenda-todoist-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        Self(dir)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src/import/tests/fixtures/todoist")
        .join(name)
}

fn csv(text: &str) -> Result<Vec<crate::import::item::RawItem>, ParseError> {
    parse_csv("Home", text.as_bytes(), &mut HashMap::new())
}

const HEAD: &str = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,DATE,DEADLINE\n";

#[test]
fn csv_by_header_name_any_order() {
    let items = parse_file(&fixture("Errands [2203].csv")).expect("parses");
    assert_eq!(items.len(), 1);
    let item = &items[0];
    assert_eq!(item.title, "Buy stamps");
    assert_eq!(item.notes, "At the post office");
    assert_eq!(item.priority, Some(TaskPriority::High));
    assert_eq!(item.due.as_deref(), Some("2026-11-20"));
    assert_eq!(item.tags, ["Errands"]);
}

#[test]
fn csv_missing_headers_not_an_export() {
    assert_eq!(csv("CONTENT,PRIORITY\nA,1\n"), Err(ParseError::NotAnExport));
    assert_eq!(csv("TYPE,PRIORITY\ntask,1\n"), Err(ParseError::NotAnExport));
    assert_eq!(csv(""), Err(ParseError::NotAnExport));
    let bad = parse_csv("Home", &[0x54, 0x59, 0xff, 0xfe], &mut HashMap::new());
    assert_eq!(bad, Err(ParseError::NotAnExport));
}

#[test]
fn csv_bom_and_multiline_quotes() {
    let text =
        format!("\u{feff}{HEAD}task,\"Say \"\"hi\"\", then go\",\"line one\nline two\",,,,\n");
    let items = csv(&text).expect("parses");
    assert_eq!(items[0].title, "Say \"hi\", then go");
    assert_eq!(items[0].notes, "line one\nline two");
}

#[test]
fn csv_crlf_built_in_test() {
    let text = format!("{HEAD}task,One,,,,,\r\ntask,Two,,,,,\r\n");
    let items = csv(&text).expect("parses");
    let titles: Vec<&str> = items.iter().map(|i| i.title.as_str()).collect();
    assert_eq!(titles, ["One", "Two"]);
    let lf = csv(&text.replace("\r\n", "\n")).expect("parses");
    assert_eq!(lf, items);
}

#[test]
fn sections_and_notes_rows() {
    let items = parse_file(&fixture("Home copy.csv")).expect("parses");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].tags, ["Home", "Soon"]);
    assert_eq!(items[0].notes, "Photos needed");
    assert_eq!(items[0].priority, Some(TaskPriority::Low));
    assert_eq!(items[0].date_lines, ["Todoist date: every year"]);
    let text = format!(
        "{HEAD}task,A,first,,1,,\nnote,n1,,,,,\nnote,n2,,,,,\nsection,Later,,,,,\ntask,B,,,1,,\n"
    );
    let items = csv(&text).expect("parses");
    assert_eq!(items[0].notes, "first\n\nn1\n\nn2");
    assert_eq!(items[0].tags, ["Home"]);
    assert_eq!(items[1].tags, ["Home", "Later"]);
}

#[test]
fn indent_becomes_checklist() {
    let text = format!(
        "{HEAD}task,Parent,,,1,,\ntask,Child,,,2,,\ntask,Grandchild,,,3,,\ntask,Next,,,1,,\ntask,Lone,,,2,,\n"
    );
    let items = csv(&text).expect("parses");
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].checklist, ["Child", "Grandchild"]);
    assert_eq!(items[1].title, "Next");
    assert_eq!(items[1].checklist, ["Lone"]);
}

#[test]
fn unknown_type_skipped() {
    let text = format!("{HEAD}task,A,,,,,\n,Blank,,,,,\nweird,B,,,,,\nnote,orphan,,,,,\n");
    let items = csv(&text).expect("parses");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, "A");
}

#[test]
fn priority_one_is_high() {
    let text =
        format!("{HEAD}task,A,,1,,,\ntask,B,,2,,,\ntask,C,,3,,,\ntask,D,,4,,,\ntask,E,,,,,\n");
    let p: Vec<_> = csv(&text)
        .expect("parses")
        .iter()
        .map(|i| i.priority)
        .collect();
    assert_eq!(
        p,
        [
            Some(TaskPriority::High),
            Some(TaskPriority::Medium),
            Some(TaskPriority::Low),
            None,
            None
        ]
    );
}

#[test]
fn relative_date_goes_to_notes() {
    let text = format!(
        "{HEAD}task,A,,,,every day,\ntask,B,,,,every day,20 Nov 2026\ntask,C,,,,2026-11-19,tomorrow\n"
    );
    let items = csv(&text).expect("parses");
    assert_eq!(items[0].due, None);
    assert_eq!(items[0].date_lines, ["Todoist date: every day"]);
    assert_eq!(items[1].due.as_deref(), Some("2026-11-20"));
    assert_eq!(items[1].date_lines, ["Todoist date: every day"]);
    assert_eq!(items[2].due.as_deref(), Some("2026-11-19"));
    assert_eq!(items[2].date_lines, ["Todoist deadline: tomorrow"]);
}

#[test]
fn project_name_cleanup() {
    assert_eq!(project_name("Errands [2203]"), "Errands");
    assert_eq!(project_name("Home (2)"), "Home");
    assert_eq!(project_name("Home copy"), "Home");
    assert_eq!(project_name("Home copy (2) [77]"), "Home");
    assert_eq!(project_name("Plan (draft)"), "Plan (draft)");
    assert_eq!(project_name("Plain"), "Plain");
}

#[test]
fn file_over_20mb_too_large() {
    let dir = Scratch::new("big");
    let path = dir.0.join("Big.csv");
    let file = std::fs::File::create(&path).expect("create");
    file.set_len(20 * 1024 * 1024 + 1).expect("sparse");
    assert_eq!(parse_file(&path), Err(ParseError::TooLarge));
    assert_eq!(
        parse_file(&dir.0.join("missing.csv")),
        Err(ParseError::Unreadable)
    );
}

#[test]
fn same_title_gets_distinct_origins() {
    let text = format!("{HEAD}task,Same,,,,,\ntask,Same,,,,,\ntask,Other,,,,,\n");
    let items = csv(&text).expect("parses");
    assert_ne!(items[0].origin, items[1].origin);
    assert_eq!(items[0].origin, origin::todoist("Home", "Same", 0));
    assert_eq!(items[1].origin, origin::todoist("Home", "Same", 1));
    let o = origin::todoist("Home", "Same", 0);
    assert!(o.starts_with("todoist:"));
    assert_eq!(o.len(), "todoist:".len() + 32);
    assert!(
        o[8..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    );
    assert_ne!(origin::todoist("A", "bc", 0), origin::todoist("Ab", "c", 0));
}

#[test]
fn csv_header_only_is_empty() {
    assert_eq!(csv(HEAD).expect("parses"), []);
}
