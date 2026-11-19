//! The board's columns: one setting row, `board.columns`, an ordered list of all of them,
//! read and written only here (spec 2026-11-18, §Columns). `read` cleans whatever is stored;
//! `edit` holds the four commands that change it.

mod edit;
mod read;

pub use edit::{
    run_board_column_add, run_board_column_edit, run_board_column_fold, run_board_column_remove,
};
pub(crate) use read::read;

use crate::api::{Builtin, ColumnSettings, Lane, LimitState};

pub(super) const KEY: &str = "board.columns";

/// At most this many custom columns, so 8 in all.
const MAX_CUSTOM: usize = 4;
/// A column's name is 1 to this many characters after trimming.
const NAME_MAX: usize = 24;

/// The four built-in columns, in board order.
const BUILTINS: [Builtin; 4] = [
    Builtin::Backlog,
    Builtin::Today,
    Builtin::Doing,
    Builtin::Done,
];

fn default_for(builtin: Builtin) -> ColumnSettings {
    let (name, limit) = match builtin {
        Builtin::Backlog => ("Backlog", None),
        Builtin::Today => ("Today", Some(3)),
        Builtin::Doing => ("Doing", Some(1)),
        Builtin::Done => ("Done", None),
    };
    ColumnSettings {
        lane: builtin.into(),
        name: name.to_owned(),
        limit,
        order: 0,
        folded: Some(builtin == Builtin::Done),
    }
}

/// Whether a trimmed name is 1 to 24 characters.
fn name_ok(name: &str) -> bool {
    (1..=NAME_MAX).contains(&name.chars().count())
}

/// Today 1 to 9 and Doing 1 to 3, both always set; a custom column none or 1 to 9; Backlog and
/// Done none.
fn limit_ok(lane: &Lane, limit: Option<u8>) -> bool {
    match (lane.builtin(), limit) {
        (Some(Builtin::Today), Some(n)) => (1..=9).contains(&n),
        (Some(Builtin::Doing), Some(n)) => (1..=3).contains(&n),
        (Some(Builtin::Backlog | Builtin::Done), None) | (None, None) => true,
        (None, Some(n)) => (1..=9).contains(&n),
        _ => false,
    }
}

/// Whether `column` is folded, the default applied.
pub(super) fn is_folded(column: &ColumnSettings) -> bool {
    column
        .folded
        .unwrap_or(column.lane.builtin() == Some(Builtin::Done))
}

/// Where `count` stands against `limit`.
pub(super) fn state(count: usize, limit: Option<u8>) -> LimitState {
    match limit.map(usize::from) {
        Some(limit) if count > limit => LimitState::Over,
        Some(limit) if count == limit => LimitState::At,
        _ => LimitState::Under,
    }
}
