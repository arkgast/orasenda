//! The checks on a task's fields, before anything is written.

use orasenda_core::LocalDate;
use orasenda_store::tasks::ChecklistItem;

use crate::api::{BoardError, ChecklistItemView};

pub(crate) const MAX_TITLE: usize = 200;
pub(crate) const MAX_NOTES: usize = 10_000;
pub(crate) const MAX_TAGS: usize = 8;
pub(crate) const MAX_TAG: usize = 24;
pub(crate) const MAX_CHECKLIST: usize = 30;
pub(crate) const MAX_ITEM: usize = 200;

/// A title trimmed, or why it is refused.
pub(super) fn title(text: &str) -> Result<String, BoardError> {
    let text = text.trim();
    if text.is_empty() {
        Err(BoardError::TitleEmpty)
    } else if text.chars().count() > MAX_TITLE {
        Err(BoardError::TitleTooLong)
    } else {
        Ok(text.to_owned())
    }
}

pub(super) fn notes(text: &str) -> Result<String, BoardError> {
    if text.chars().count() > MAX_NOTES {
        Err(BoardError::NotesTooLong)
    } else {
        Ok(text.to_owned())
    }
}

/// Tags trimmed, in the order typed; none empty, long or repeated (ignoring case).
pub(super) fn tags(tags: &[String]) -> Result<Vec<String>, BoardError> {
    if tags.len() > MAX_TAGS {
        return Err(BoardError::BadTags);
    }
    let mut seen: Vec<String> = Vec::new();
    let mut kept = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        let key = tag.to_lowercase();
        if tag.is_empty() || tag.chars().count() > MAX_TAG || seen.contains(&key) {
            return Err(BoardError::BadTags);
        }
        seen.push(key);
        kept.push(tag.to_owned());
    }
    Ok(kept)
}

pub(super) fn estimate(sessions: u8) -> Result<u8, BoardError> {
    if (1..=16).contains(&sessions) {
        Ok(sessions)
    } else {
        Err(BoardError::BadEstimate)
    }
}

/// A due date that is a real `YYYY-MM-DD`.
pub(super) fn due(text: &str) -> Result<String, BoardError> {
    LocalDate::parse_iso(text)
        .map(LocalDate::to_iso)
        .ok_or(BoardError::BadDue)
}

pub(super) fn checklist(items: &[ChecklistItemView]) -> Result<Vec<ChecklistItem>, BoardError> {
    if items.len() > MAX_CHECKLIST {
        return Err(BoardError::BadChecklist);
    }
    let mut kept: Vec<ChecklistItem> = Vec::new();
    for item in items {
        let text = item.text.trim();
        if item.id.is_empty()
            || text.is_empty()
            || text.chars().count() > MAX_ITEM
            || kept.iter().any(|k| k.id == item.id)
        {
            return Err(BoardError::BadChecklist);
        }
        kept.push(ChecklistItem {
            id: item.id.clone(),
            text: text.to_owned(),
            done: item.done,
        });
    }
    Ok(kept)
}

/// The title and the notes of a note moved to the Board: the text up to 200 characters, cut at
/// a line end or a word, and the rest in the notes.
pub(crate) fn split_note(text: &str) -> (String, String) {
    let text = text.trim();
    let limit = text
        .char_indices()
        .nth(MAX_TITLE)
        .map_or(text.len(), |(i, _)| i);
    let window = &text[..limit];
    let cut = if let Some(line) = window.find('\n') {
        line
    } else if limit == text.len() || text[limit..].starts_with(char::is_whitespace) {
        limit
    } else {
        window.rfind(char::is_whitespace).unwrap_or(limit)
    };
    (
        text[..cut].trim_end().to_owned(),
        text[cut..].trim().to_owned(),
    )
}
