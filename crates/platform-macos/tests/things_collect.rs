//! Runs the Things script under `osascript` against a stub application. `MacThings` is never
//! constructed here: Things is not on the CI machines and a real read would prompt.
#![cfg(target_os = "macos")]

use std::process::Command;

use orasenda_platform_macos::THINGS_COLLECT_JS;

/// A stand-in for `Application(...)`. `whose` filters on `status` like Things does.
const STUB: &str = r#"
function stubApp() {
  const rows = [
    { id: "A1b2", name: "Draft Q1 plan", notes: "Outline first", project: "Work", area: null,
      tagNames: "planning, q1", dueDate: new Date(2026, 10, 20, 23, 30), activationDate: null, status: "open" },
    { id: "Z9", name: "Old thing", notes: "", project: null, area: null,
      tagNames: "", dueDate: null, activationDate: null, status: "completed" },
    { id: "C3d4", name: "Book dentist", notes: "", project: null, area: "Home",
      tagNames: "", dueDate: null, activationDate: new Date(2026, 10, 18, 0, 5), status: "open" },
  ];
  const view = (list) => {
    const out = {};
    for (const key of ["id", "name", "notes", "tagNames", "dueDate", "activationDate", "status"]) {
      out[key] = () => list.map((r) => r[key]);
    }
    out.project = { name: () => list.map((r) => r.project) };
    out.area = { name: () => list.map((r) => r.area) };
    out.whose = (q) => view(list.filter((r) => r.status === q.status));
    return out;
  }
  return { toDos: view(rows) };
}
collect(stubApp());
"#;

fn run(caller: &str) -> String {
    let script = format!("{THINGS_COLLECT_JS}\n{caller}");
    let out = Command::new("/usr/bin/osascript")
        .env_clear()
        .args(["-l", "JavaScript", "-e", &script])
        .output()
        .expect("osascript runs");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout)
        .expect("utf-8")
        .trim_end()
        .to_string()
}

#[test]
fn collect_returns_open_todos_as_json() {
    let want = r#"[{"id":"A1b2","name":"Draft Q1 plan","notes":"Outline first","project":"Work","area":null,"tagNames":"planning, q1","dueDate":"2026-11-20","activationDate":null},{"id":"C3d4","name":"Book dentist","notes":"","project":null,"area":"Home","tagNames":"","dueDate":null,"activationDate":"2026-11-18"}]"#;
    assert_eq!(run(STUB), want);
}

#[test]
fn collect_formats_local_dates() {
    let caller = r#"
const app = { toDos: { whose: () => ({
  id: () => ["x"], name: () => ["n"], notes: () => [""], tagNames: () => [""],
  dueDate: () => [new Date(2027, 0, 5, 0, 0, 1)], activationDate: () => [new Date(2026, 11, 31, 23, 59, 59)],
  project: { name: () => [null] }, area: { name: () => [null] } }) } };
collect(app);
"#;
    let out = run(caller);
    assert!(out.contains(r#""dueDate":"2027-01-05""#), "{out}");
    assert!(out.contains(r#""activationDate":"2026-12-31""#), "{out}");
}
