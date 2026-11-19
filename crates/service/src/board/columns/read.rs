//! Reading the setting row: whatever is stored becomes a clean list (spec 2026-11-18,
//! §Columns, "On read").

use orasenda_store::{StoreError, Txn, settings};
use serde_json::Value;

use super::{BUILTINS, KEY, MAX_CUSTOM, default_for, is_folded, limit_ok, name_ok};
use crate::api::{ColumnSettings, Lane};

/// All columns in board order. A missing or unreadable row reads as the four defaults; a
/// readable one is cleaned by [`clean`].
pub(crate) fn read(txn: &Txn) -> Result<Vec<ColumnSettings>, StoreError> {
    let stored = match settings::get::<Vec<Value>>(txn, KEY) {
        Ok(stored) => stored.unwrap_or_default(),
        Err(StoreError::Json(error)) => {
            eprintln!("board: {KEY} could not be decoded ({error}); using the defaults");
            Vec::new()
        }
        Err(error) => return Err(error),
    };
    let entries = stored
        .into_iter()
        .filter_map(|entry| match serde_json::from_value(entry) {
            Ok(column) => Some(column),
            Err(error) => {
                eprintln!("board: a column in {KEY} was dropped ({error})");
                None
            }
        })
        .collect();
    Ok(clean(entries))
}

fn valid(column: &ColumnSettings) -> bool {
    name_ok(&column.name) && limit_ok(&column.lane, column.limit)
}

/// The list the board shows, from whatever was stored:
/// - sorted by `order`, array position breaking ties;
/// - a repeated or invalid entry dropped, a built-in's invalid entry read as its default, and
///   custom entries past the fourth dropped;
/// - built-ins back in their fixed order, a missing one at its default place, and no custom
///   column after Done;
/// - `order` matching position and `folded` always set.
pub(super) fn clean(mut entries: Vec<ColumnSettings>) -> Vec<ColumnSettings> {
    entries.sort_by_key(|column| column.order);
    let mut list: Vec<ColumnSettings> = Vec::new();
    let mut customs = 0;
    for mut column in entries {
        column.name = column.name.trim().to_owned();
        if list.iter().any(|kept| kept.lane == column.lane) {
            continue;
        }
        let custom = column.lane.builtin().is_none();
        if !valid(&column) {
            if custom {
                eprintln!("board: the column {:?} in {KEY} was dropped", column.name);
            }
            continue;
        }
        if custom {
            if customs == MAX_CUSTOM {
                eprintln!("board: more than {MAX_CUSTOM} custom columns in {KEY}; dropped one");
                continue;
            }
            customs += 1;
        }
        list.push(column);
    }
    fix_builtins(&mut list);
    for (at, column) in list.iter_mut().enumerate() {
        column.order = u8::try_from(at).unwrap_or(u8::MAX);
        column.folded = Some(is_folded(column));
    }
    list
}

fn builtin_rank(lane: &Lane) -> usize {
    BUILTINS
        .iter()
        .position(|b| Some(*b) == lane.builtin())
        .unwrap_or(BUILTINS.len())
}

/// Puts the built-ins in their fixed order inside the slots they hold, restores a missing one
/// right after the built-in before it (Backlog first), and moves any custom column that sits
/// after Done to just before it.
fn fix_builtins(list: &mut Vec<ColumnSettings>) {
    let slots: Vec<usize> = (0..list.len())
        .filter(|&i| list[i].lane.builtin().is_some())
        .collect();
    let mut present: Vec<ColumnSettings> = slots.iter().map(|&i| list[i].clone()).collect();
    present.sort_by_key(|column| builtin_rank(&column.lane));
    for (slot, column) in slots.into_iter().zip(present) {
        list[slot] = column;
    }
    for builtin in BUILTINS {
        let lane = Lane::from(builtin);
        if list.iter().any(|column| column.lane == lane) {
            continue;
        }
        let at = list
            .iter()
            .rposition(|column| {
                column.lane.builtin().is_some_and(|b| {
                    builtin_rank(&column.lane) < builtin_rank(&lane) && b != builtin
                })
            })
            .map_or(0, |i| i + 1);
        list.insert(at, default_for(builtin));
    }
    if let Some(done) = list.iter().position(|c| c.lane == Lane::DONE) {
        let after: Vec<ColumnSettings> = list.split_off(done + 1);
        let done = list.pop();
        list.extend(after);
        list.extend(done);
    }
}
