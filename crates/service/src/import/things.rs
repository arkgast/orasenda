//! Things to-dos as source-neutral items (spec Mapping, Things column). The JSON is the
//! contract between the osascript reader and this parser; items arrive already filtered to
//! open to-dos, and this does not filter.

use serde::Deserialize;

use crate::import::dates;
use crate::import::item::RawItem;

/// The text was not the JSON array the Things reader writes.
#[derive(Debug)]
pub(crate) struct ParseError(pub String);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Todo {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    area: Option<String>,
    #[serde(default)]
    tag_names: String,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    activation_date: Option<String>,
}

/// Items ordered by project or area, then the script's own order.
pub(crate) fn parse(json: &str) -> Result<Vec<RawItem>, ParseError> {
    let todos: Vec<Todo> = serde_json::from_str(json).map_err(|e| ParseError(e.to_string()))?;
    let mut keyed: Vec<(String, RawItem)> = todos.into_iter().map(raw).collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(keyed.into_iter().map(|(_, item)| item).collect())
}

fn non_empty(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

fn raw(todo: Todo) -> (String, RawItem) {
    let group = non_empty(todo.project).or_else(|| non_empty(todo.area));
    let mut tags: Vec<String> = group.iter().cloned().collect();
    tags.extend(
        todo.tag_names
            .split(',')
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(str::to_owned),
    );
    let mut due = None;
    let mut date_lines = Vec::new();
    if let Some(text) = non_empty(todo.due_date) {
        due = dates::absolute(&text);
        if due.is_none() {
            date_lines.push(format!("Things deadline: {text}"));
        }
    }
    if let Some(text) = non_empty(todo.activation_date) {
        date_lines.push(format!("When in Things: {text}"));
    }
    let item = RawItem {
        origin: format!("things:{}", todo.id),
        title: todo.name,
        notes: todo.notes.trim().to_owned(),
        tags,
        priority: None,
        due,
        checklist: Vec::new(),
        date_lines,
    };
    (group.unwrap_or_default(), item)
}
