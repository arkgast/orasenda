//! Todoist backup `.zip` archives, read in memory through a capped reader.
use crate::import::item::RawItem;
use crate::import::todoist::{ParseError, Seen};

pub(crate) fn parse_zip(_bytes: &[u8], _seen: &mut Seen) -> Result<Vec<RawItem>, ParseError> {
    Err(ParseError::Unreadable)
}
