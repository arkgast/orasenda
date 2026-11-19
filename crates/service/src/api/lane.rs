//! A board column's id as the webview sees it: a plain string.

use std::borrow::Cow;

use orasenda_store::tasks;
use serde::{Deserialize, Serialize};

/// A board column's id: one of the four built-ins (`backlog`, `today`, `doing`, `done`) or a
/// custom id, `c_` and 8 characters of `[0-9a-z]`. The UI says "column"; SQL says `lane`.
/// Deserializing refuses a malformed id; whether a column exists on this board is the
/// service's check.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(try_from = "String", into = "String")]
#[specta(type = String)]
pub struct Lane(Cow<'static, str>);

/// The four built-in columns, for `match` on [`Lane::builtin`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Builtin {
    Backlog,
    Today,
    Doing,
    Done,
}

impl Lane {
    pub const BACKLOG: Lane = Lane(Cow::Borrowed("backlog"));
    pub const TODAY: Lane = Lane(Cow::Borrowed("today"));
    pub const DOING: Lane = Lane(Cow::Borrowed("doing"));
    pub const DONE: Lane = Lane(Cow::Borrowed("done"));

    /// A built-in, or `c_` followed by 8 of `[0-9a-z]`; anything else is `None`.
    pub fn parse(text: &str) -> Option<Lane> {
        tasks::Lane::parse(text).map(|lane| Lane::from_stored(&lane))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Which built-in this is, or `None` for a custom column.
    pub fn builtin(&self) -> Option<Builtin> {
        match self.as_str() {
            "backlog" => Some(Builtin::Backlog),
            "today" => Some(Builtin::Today),
            "doing" => Some(Builtin::Doing),
            "done" => Some(Builtin::Done),
            _ => None,
        }
    }

    /// The same id as the store holds it. The store's rule is the one [`Lane::parse`] applies,
    /// so a stored lane is always a valid one.
    pub(crate) fn from_stored(lane: &tasks::Lane) -> Lane {
        match lane.builtin() {
            Some(tasks::Builtin::Backlog) => Lane::BACKLOG,
            Some(tasks::Builtin::Today) => Lane::TODAY,
            Some(tasks::Builtin::Doing) => Lane::DOING,
            Some(tasks::Builtin::Done) => Lane::DONE,
            None => Lane(Cow::Owned(lane.as_str().to_owned())),
        }
    }
}

impl From<Builtin> for Lane {
    fn from(builtin: Builtin) -> Lane {
        match builtin {
            Builtin::Backlog => Lane::BACKLOG,
            Builtin::Today => Lane::TODAY,
            Builtin::Doing => Lane::DOING,
            Builtin::Done => Lane::DONE,
        }
    }
}

impl TryFrom<String> for Lane {
    type Error = String;

    fn try_from(text: String) -> Result<Lane, String> {
        Lane::parse(&text).ok_or_else(|| format!("not a column id: {text:?}"))
    }
}

impl From<Lane> for String {
    fn from(lane: Lane) -> String {
        lane.0.into_owned()
    }
}
