//! Things.
use crate::import::item::RawItem;
#[derive(Debug)]
pub(crate) struct ParseError(pub String);
pub(crate) fn parse(_: &str) -> Result<Vec<RawItem>, ParseError> { todo!() }
