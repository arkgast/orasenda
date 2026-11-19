//! The four column commands (spec 2026-11-18, §Service). Each runs in one write under the
//! service lock, reads the cleaned list inside it and stores the cleaned list back, then
//! emits `board-changed` after the lock (`board::write`). A refusal writes nothing.

use orasenda_store::tasks;
use orasenda_store::{StoreError, Txn, settings};
use uuid::Uuid;

use super::read::read;
use super::{KEY, MAX_CUSTOM, limit_ok, name_ok};
use crate::api::{BoardError, ColumnSettings, Lane};
use crate::board::view::stored_lane;
use crate::board::write;
use crate::scheduler::Host;

/// Stores `list` with `order` matching position.
fn store(txn: &mut Txn, mut list: Vec<ColumnSettings>) -> Result<(), StoreError> {
    for (at, column) in list.iter_mut().enumerate() {
        column.order = u8::try_from(at).unwrap_or(u8::MAX);
    }
    settings::set(txn, KEY, &list)
}

fn find(list: &[ColumnSettings], lane: &Lane) -> Result<usize, BoardError> {
    list.iter()
        .position(|column| column.lane == *lane)
        .ok_or(BoardError::ColumnNotFound)
}

/// `c_` and 8 characters of `[0-9a-z]`, from the random bits of a UUID.
fn random_id() -> String {
    const ALPHABET: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut id = String::from("c_");
    while id.len() < 10 {
        let bytes = Uuid::new_v4().into_bytes();
        // Bytes 6 and 8 carry the version and variant bits; the rest are random. A byte of 252
        // or more is skipped so the 36 characters stay equally likely.
        for (at, byte) in bytes.into_iter().enumerate() {
            if at != 6 && at != 8 && byte < 252 && id.len() < 10 {
                id.push(char::from(ALPHABET[usize::from(byte) % ALPHABET.len()]));
            }
        }
    }
    id
}

/// A fresh id that no column, and no live task's lane, already holds.
fn new_id(txn: &Txn, list: &[ColumnSettings]) -> Result<Lane, StoreError> {
    let in_use = tasks::lanes_live(txn)?;
    loop {
        let id = random_id();
        let taken = list.iter().any(|c| c.lane.as_str() == id)
            || in_use.iter().any(|lane| lane.as_str() == id);
        if let (false, Some(lane)) = (taken, Lane::parse(&id)) {
            return Ok(lane);
        }
    }
}

/// The first free of "New column", "New column 2", "New column 3", ...
fn free_name(list: &[ColumnSettings]) -> String {
    (1..)
        .map(|n| match n {
            1 => "New column".to_owned(),
            n => format!("New column {n}"),
        })
        .find(|name| {
            let name = name.to_lowercase();
            !list.iter().any(|c| c.name.to_lowercase() == name)
        })
        .unwrap_or_default()
}

/// `board_column_add`: a custom column right after `after`, open, with no limit. Answers its id.
pub fn run_board_column_add<H: Host>(host: &H, after: Lane) -> Result<Lane, BoardError> {
    write(host, |txn, _| {
        let mut list = read(txn)?;
        let at = match list.iter().position(|c| c.lane == after) {
            Some(at) if after != Lane::DONE => at,
            _ => return Ok(Err(BoardError::BadColumns)),
        };
        if list.iter().filter(|c| c.lane.builtin().is_none()).count() >= MAX_CUSTOM {
            return Ok(Err(BoardError::TooManyColumns));
        }
        let lane = new_id(txn, &list)?;
        let name = free_name(&list);
        list.insert(
            at + 1,
            ColumnSettings {
                lane: lane.clone(),
                name,
                limit: None,
                order: 0,
                folded: Some(false),
            },
        );
        store(txn, list)?;
        Ok(Ok(lane))
    })
}

/// `board_column_remove`: a custom column, while no live task is in it.
pub fn run_board_column_remove<H: Host>(host: &H, lane: Lane) -> Result<(), BoardError> {
    write(host, |txn, _| {
        if lane.builtin().is_some() {
            return Ok(Err(BoardError::BadColumns));
        }
        let mut list = read(txn)?;
        let Ok(at) = find(&list, &lane) else {
            return Ok(Err(BoardError::ColumnNotFound));
        };
        if tasks::count_live_in(txn, &stored_lane(&lane)?)? > 0 {
            return Ok(Err(BoardError::ColumnNotEmpty));
        }
        list.remove(at);
        store(txn, list)?;
        Ok(Ok(()))
    })
}

/// `board_column_edit`: a column's name and limit in one write.
pub fn run_board_column_edit<H: Host>(
    host: &H,
    lane: Lane,
    name: String,
    limit: Option<u8>,
) -> Result<(), BoardError> {
    write(host, |txn, _| {
        let mut list = read(txn)?;
        let at = match find(&list, &lane) {
            Ok(at) => at,
            Err(error) => return Ok(Err(error)),
        };
        let name = name.trim();
        let lowered = name.to_lowercase();
        let taken = list
            .iter()
            .enumerate()
            .any(|(i, c)| i != at && c.name.to_lowercase() == lowered);
        if !name_ok(name) || taken {
            return Ok(Err(BoardError::BadColumnName));
        }
        if !limit_ok(&lane, limit) {
            return Ok(Err(BoardError::BadLimit));
        }
        list[at].name = name.to_owned();
        list[at].limit = limit;
        store(txn, list)?;
        Ok(Ok(()))
    })
}

/// `board_column_fold`: saves whether a column is folded.
pub fn run_board_column_fold<H: Host>(
    host: &H,
    lane: Lane,
    folded: bool,
) -> Result<(), BoardError> {
    write(host, |txn, _| {
        let mut list = read(txn)?;
        let at = match find(&list, &lane) {
            Ok(at) => at,
            Err(error) => return Ok(Err(error)),
        };
        list[at].folded = Some(folded);
        store(txn, list)?;
        Ok(Ok(()))
    })
}
