//! Todoist CSV exports as source-neutral items (spec Mapping, Todoist column). Columns are
//! found by header name, so their order and any extra columns do not matter.

use std::collections::HashMap;
use std::path::Path;

use csv::StringRecord;

use crate::api::TaskPriority;
use crate::import::item::RawItem;
use crate::import::{dates, origin, todoist_zip};

/// A file larger than this (from its metadata) is refused before it is read.
const MAX_FILE: u64 = 20 * 1024 * 1024;

/// Why a file is not an import.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ParseError {
    /// No `TYPE` and `CONTENT` headers, not UTF-8, or a `.zip` with no export in it.
    NotAnExport,
    /// The file could not be opened or read.
    Unreadable,
    /// Over 20 MB, or an archive that unpacks past its caps.
    TooLarge,
}

/// Rows seen so far per (project, title), for the origin's repeat count.
pub(crate) type Seen = HashMap<(String, String), u32>;

/// The open tasks of a Todoist CSV, or of every project CSV in a backup `.zip`.
pub(crate) fn parse_file(path: &Path) -> Result<Vec<RawItem>, ParseError> {
    let meta = std::fs::metadata(path).map_err(|_| ParseError::Unreadable)?;
    if !meta.is_file() {
        return Err(ParseError::Unreadable);
    }
    if meta.len() > MAX_FILE {
        return Err(ParseError::TooLarge);
    }
    let bytes = std::fs::read(path).map_err(|_| ParseError::Unreadable)?;
    let mut seen = Seen::new();
    let is_zip = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
    if is_zip || bytes.starts_with(b"PK\x03\x04") {
        return todoist_zip::parse_zip(&bytes, &mut seen);
    }
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    parse_csv(&project_name(&stem), &bytes, &mut seen)
}

/// The project's name from a file or entry stem, without a trailing ` [id]`, ` (n)` or
/// ` copy`.
pub(crate) fn project_name(stem: &str) -> String {
    let mut name = stem.trim();
    loop {
        let cut = if name.ends_with(']') {
            name.rfind(" [")
        } else if name.ends_with(')') {
            name.rfind(" (")
                .filter(|&at| {
                    name[at + 2..name.len() - 1]
                        .bytes()
                        .all(|b| b.is_ascii_digit())
                })
                .filter(|&at| at + 3 < name.len())
        } else {
            name.strip_suffix(" copy").map(str::len)
        };
        match cut {
            Some(at) => name = name[..at].trim_end(),
            None => return name.to_owned(),
        }
    }
}

struct Columns {
    kind: usize,
    content: usize,
    description: Option<usize>,
    priority: Option<usize>,
    indent: Option<usize>,
    date: Option<usize>,
    deadline: Option<usize>,
}

impl Columns {
    fn find(headers: &StringRecord) -> Option<Self> {
        let at = |name: &str| {
            headers
                .iter()
                .position(|h| h.trim().eq_ignore_ascii_case(name))
        };
        Some(Self {
            kind: at("TYPE")?,
            content: at("CONTENT")?,
            description: at("DESCRIPTION"),
            priority: at("PRIORITY"),
            indent: at("INDENT"),
            date: at("DATE"),
            deadline: at("DEADLINE"),
        })
    }
}

fn cell(row: &StringRecord, column: Option<usize>) -> &str {
    column.and_then(|c| row.get(c)).unwrap_or("").trim()
}

/// Items of one project's CSV. `seen` counts same-titled rows across the whole file or
/// archive, so no two items share an origin.
pub(crate) fn parse_csv(
    project: &str,
    bytes: &[u8],
    seen: &mut Seen,
) -> Result<Vec<RawItem>, ParseError> {
    let text = std::str::from_utf8(bytes).map_err(|_| ParseError::NotAnExport)?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(text.as_bytes());
    let headers = reader.headers().map_err(|_| ParseError::NotAnExport)?;
    let columns = Columns::find(headers).ok_or(ParseError::NotAnExport)?;
    let mut items: Vec<RawItem> = Vec::new();
    let mut section = String::new();
    // The indent of the last top-level task; a deeper task is its checklist item.
    let mut parent_indent: Option<u32> = None;
    for row in reader.records() {
        let row = row.map_err(|_| ParseError::NotAnExport)?;
        let content = cell(&row, Some(columns.content));
        match cell(&row, Some(columns.kind)).to_ascii_lowercase().as_str() {
            "section" => {
                section = content.to_owned();
                parent_indent = None;
            }
            "note" => {
                if let (Some(item), false) = (items.last_mut(), content.is_empty()) {
                    if !item.notes.is_empty() {
                        item.notes.push_str("\n\n");
                    }
                    item.notes.push_str(content);
                }
            }
            "task" if !content.is_empty() => {
                let indent: u32 = cell(&row, columns.indent).parse().unwrap_or(1);
                let n = seen
                    .entry((project.to_owned(), content.to_owned()))
                    .or_insert(0);
                let count = *n;
                *n += 1;
                match (parent_indent, items.last_mut()) {
                    (Some(parent), Some(item)) if indent > parent => {
                        item.checklist.push(content.to_owned());
                    }
                    _ => {
                        parent_indent = Some(indent);
                        items.push(task(project, &section, content, count, &row, &columns));
                    }
                }
            }
            _ => {}
        }
    }
    Ok(items)
}

fn task(
    project: &str,
    section: &str,
    title: &str,
    n: u32,
    row: &StringRecord,
    columns: &Columns,
) -> RawItem {
    let tags = [project, section]
        .into_iter()
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
        .collect();
    let priority = match cell(row, columns.priority) {
        "1" => Some(TaskPriority::High),
        "2" => Some(TaskPriority::Medium),
        "3" => Some(TaskPriority::Low),
        _ => None,
    };
    // The deadline first, then the date: the first absolute one is the due date, and any
    // other text is kept in the notes.
    let texts = [
        ("Todoist deadline", cell(row, columns.deadline)),
        ("Todoist date", cell(row, columns.date)),
    ];
    let used = texts
        .iter()
        .position(|(_, text)| dates::absolute(text).is_some());
    let due = used.and_then(|i| dates::absolute(texts[i].1));
    let date_lines = texts
        .iter()
        .enumerate()
        .filter(|(i, (_, text))| Some(*i) != used && !text.is_empty())
        .map(|(_, (label, text))| format!("{label}: {text}"))
        .collect();
    RawItem {
        origin: origin::todoist(project, title, n),
        title: title.to_owned(),
        notes: cell(row, columns.description).to_owned(),
        tags,
        priority,
        due,
        checklist: Vec::new(),
        date_lines,
    }
}
