//! The columns' names and limits: one setting row, `board.columns`, read and written only
//! here.

use orasenda_store::{StoreError, Txn, settings};

use crate::api::{BoardError, ColumnSettings, Lane, LimitState};

pub(super) const KEY: &str = "board.columns";
pub(super) const LANES: [Lane; 4] = [Lane::Backlog, Lane::Today, Lane::Doing, Lane::Done];

fn default_for(lane: Lane) -> ColumnSettings {
    let (name, limit) = match lane {
        Lane::Backlog => ("Backlog", None),
        Lane::Today => ("Today", Some(3)),
        Lane::Doing => ("Doing", Some(1)),
        Lane::Done => ("Done", None),
    };
    ColumnSettings {
        lane,
        name: name.to_owned(),
        limit,
    }
}

/// The four columns in board order. A missing, unreadable or incomplete row falls back to the
/// defaults, per column.
pub(super) fn read(txn: &Txn) -> Result<Vec<ColumnSettings>, StoreError> {
    let stored = match settings::get::<Vec<ColumnSettings>>(txn, KEY) {
        Ok(stored) => stored.unwrap_or_default(),
        Err(StoreError::Json(error)) => {
            eprintln!("board: {KEY} could not be decoded ({error}); using the defaults");
            Vec::new()
        }
        Err(error) => return Err(error),
    };
    Ok(LANES
        .iter()
        .map(|lane| {
            stored
                .iter()
                .find(|c| c.lane == *lane && valid(c))
                .cloned()
                .unwrap_or_else(|| default_for(*lane))
        })
        .collect())
}

fn valid(column: &ColumnSettings) -> bool {
    let name = column.name.trim().chars().count();
    let limit_ok = match (column.lane, column.limit) {
        (Lane::Today, Some(n)) => (1..=9).contains(&n),
        (Lane::Doing, Some(n)) => (1..=3).contains(&n),
        (Lane::Backlog | Lane::Done, None) => true,
        _ => false,
    };
    (1..=24).contains(&name) && limit_ok
}

/// Exactly one entry per column, names trimmed, limits in range; in board order.
pub(super) fn checked(columns: &[ColumnSettings]) -> Result<Vec<ColumnSettings>, BoardError> {
    if columns.len() != LANES.len() {
        return Err(BoardError::BadColumns);
    }
    LANES
        .iter()
        .map(|lane| {
            let mut found = columns.iter().filter(|c| c.lane == *lane);
            let (Some(column), None) = (found.next(), found.next()) else {
                return Err(BoardError::BadColumns);
            };
            let column = ColumnSettings {
                lane: *lane,
                name: column.name.trim().to_owned(),
                limit: column.limit,
            };
            if valid(&column) {
                Ok(column)
            } else {
                Err(BoardError::BadColumns)
            }
        })
        .collect()
}

pub(super) fn write(txn: &mut Txn, columns: &[ColumnSettings]) -> Result<(), StoreError> {
    settings::set(txn, KEY, &columns.to_vec())
}

/// Where `count` stands against `limit`.
pub(super) fn state(count: usize, limit: Option<u8>) -> LimitState {
    match limit.map(usize::from) {
        Some(limit) if count > limit => LimitState::Over,
        Some(limit) if count == limit => LimitState::At,
        _ => LimitState::Under,
    }
}
