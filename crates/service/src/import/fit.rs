//! Fitting a source item to the Board's limits (spec 2026-11-15-task-import, Mapping).
//! Nothing the user wrote is dropped silently: the parts that spill into the notes are
//! composed in a fixed order, and what is cut or skipped is counted for the preview.

use crate::api::TaskPriority;
use crate::board::check::{
    MAX_CHECKLIST, MAX_ITEM, MAX_NOTES, MAX_TAG, MAX_TAGS, MAX_TITLE, split_note,
};
use crate::import::item::RawItem;

/// A task ready to be written: every field inside the Board's limits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FittedTask {
    pub origin: String,
    pub title: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub priority: Option<TaskPriority>,
    pub due: Option<String>,
    pub checklist: Vec<String>,
}

/// The outcome of fitting one item, with what had to give.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Fitted {
    /// `None` when the title is empty: the item is left out.
    pub task: Option<FittedTask>,
    pub shortened: bool,
    pub tags_over: bool,
    pub checklist_over: bool,
    pub notes_cut: bool,
}

/// Counts of what fitting changed, for the preview's summary.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Summary {
    pub untitled: u32,
    pub shortened: u32,
    pub tags_over: u32,
    pub checklist_over: u32,
    pub notes_cut: u32,
    /// Set for Things, whose to-dos arrive without checklists (Decision 12).
    pub things_checklists: bool,
}

impl Summary {
    pub fn from_fitted(items: &[Fitted]) -> Self {
        let count = |f: fn(&Fitted) -> bool| items.iter().filter(|i| f(i)).count() as u32;
        Self {
            untitled: count(|i| i.task.is_none()),
            shortened: count(|i| i.shortened),
            tags_over: count(|i| i.tags_over),
            checklist_over: count(|i| i.checklist_over),
            notes_cut: count(|i| i.notes_cut),
            things_checklists: false,
        }
    }

    /// The summary lines, in the spec's words; none for a count of zero.
    pub fn lines(&self) -> Vec<String> {
        let mut lines = Vec::new();
        match self.untitled {
            0 => {}
            1 => lines.push("1 item with no title was left out.".to_owned()),
            n => lines.push(format!("{n} items with no title were left out.")),
        }
        match self.shortened {
            0 => {}
            1 => lines.push("1 title was shortened; the rest is in its notes.".to_owned()),
            n => lines.push(format!(
                "{n} titles were shortened; the rest is in their notes."
            )),
        }
        match self.tags_over {
            0 => {}
            1 => lines.push(format!(
                "1 task had more than {MAX_TAGS} tags; the rest were left out."
            )),
            n => lines.push(format!(
                "{n} tasks had more than {MAX_TAGS} tags; the rest were left out."
            )),
        }
        match self.checklist_over {
            0 => {}
            1 => lines.push(format!(
                "1 checklist was longer than {MAX_CHECKLIST} items; the rest is in its notes."
            )),
            n => lines.push(format!(
                "{n} checklists were longer than {MAX_CHECKLIST} items; the rest is in their notes."
            )),
        }
        match self.notes_cut {
            0 => {}
            1 => lines.push("1 note was cut to fit.".to_owned()),
            n => lines.push(format!("{n} notes were cut to fit.")),
        }
        if self.things_checklists {
            lines.push("Things doesn't share checklists, so they stay in Things.".to_owned());
        }
        lines
    }
}

/// Fits one item. The notes are composed as the title's remainder, the source notes, the
/// extra checklist lines and the date lines, and cut on a line end past 10 000 characters.
pub(crate) fn fit(item: RawItem) -> Fitted {
    let title = item.title.trim();
    if title.is_empty() {
        return Fitted {
            task: None,
            shortened: false,
            tags_over: false,
            checklist_over: false,
            notes_cut: false,
        };
    }
    let shortened = title.chars().count() > MAX_TITLE;
    let (title, remainder) = if shortened {
        split_note(title)
    } else {
        (title.to_owned(), String::new())
    };
    let (tags, tags_over) = fit_tags(&item.tags);
    let (checklist, spill) = fit_checklist(&item.checklist);
    let checklist_over = !spill.is_empty();
    let parts = [
        remainder,
        item.notes.trim().to_owned(),
        spill.join("\n"),
        item.date_lines.join("\n"),
    ];
    let (notes, notes_cut) = cut_notes(&parts);
    Fitted {
        task: Some(FittedTask {
            origin: item.origin,
            title,
            notes,
            tags,
            priority: item.priority,
            due: item.due,
            checklist,
        }),
        shortened,
        tags_over,
        checklist_over,
        notes_cut,
    }
}

/// Trimmed, cut to 24 characters, no repeats (ignoring case), at most 8; and whether any
/// tag past the eighth was left out.
fn fit_tags(tags: &[String]) -> (Vec<String>, bool) {
    let mut seen: Vec<String> = Vec::new();
    let mut kept = Vec::new();
    let mut over = false;
    for tag in tags {
        let tag: String = tag.trim().chars().take(MAX_TAG).collect();
        let tag = tag.trim_end().to_owned();
        let key = tag.to_lowercase();
        if tag.is_empty() || seen.contains(&key) {
            continue;
        }
        if kept.len() == MAX_TAGS {
            over = true;
            continue;
        }
        seen.push(key);
        kept.push(tag);
    }
    (kept, over)
}

/// The first 30 items cut to 200 characters, and the rest as `- text` lines.
fn fit_checklist(items: &[String]) -> (Vec<String>, Vec<String>) {
    let mut kept = Vec::new();
    let mut spill = Vec::new();
    for item in items {
        let text = item.trim();
        if text.is_empty() {
            continue;
        }
        if kept.len() < MAX_CHECKLIST {
            kept.push(text.chars().take(MAX_ITEM).collect::<String>());
        } else {
            spill.push(format!("- {text}"));
        }
    }
    (kept, spill)
}

/// The parts joined by line ends within 10 000 characters. Whole lines are kept in order; the
/// first line that does not fit is cut at the limit only when it starts its part, otherwise
/// it and everything after it go (later parts first).
fn cut_notes(parts: &[String]) -> (String, bool) {
    let mut out = String::new();
    let mut used = 0;
    let mut cut = false;
    'parts: for part in parts.iter().filter(|p| !p.is_empty()) {
        for (index, line) in part.split('\n').enumerate() {
            let sep = usize::from(used > 0);
            let len = line.chars().count();
            if used + sep + len <= MAX_NOTES {
                if sep == 1 {
                    out.push('\n');
                }
                out.push_str(line);
                used += sep + len;
                continue;
            }
            cut = true;
            let room = MAX_NOTES.saturating_sub(used + sep);
            if index == 0 && room > 0 {
                if sep == 1 {
                    out.push('\n');
                }
                out.extend(line.chars().take(room));
            }
            break 'parts;
        }
    }
    (out.trim_end().to_owned(), cut)
}
