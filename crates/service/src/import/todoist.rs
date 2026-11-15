//! Todoist CSV exports as source-neutral items (spec Mapping, Todoist column).
use std::collections::HashMap;
use std::path::Path;

use crate::import::item::RawItem;

/// Why a file is not an import.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ParseError {
    NotAnExport,
    Unreadable,
    TooLarge,
}

/// Rows seen so far per (project, title), for the origin's repeat count.
pub(crate) type Seen = HashMap<(String, String), u32>;

pub(crate) fn parse_file(_path: &Path) -> Result<Vec<RawItem>, ParseError> {
    Err(ParseError::Unreadable)
}

pub(crate) fn parse_csv(
    _project: &str,
    _bytes: &[u8],
    _seen: &mut Seen,
) -> Result<Vec<RawItem>, ParseError> {
    Err(ParseError::Unreadable)
}

pub(crate) fn project_name(stem: &str) -> String {
    stem.to_owned()
}
