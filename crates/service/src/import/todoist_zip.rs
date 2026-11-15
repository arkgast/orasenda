//! Todoist backup `.zip` archives, read in memory through a capped reader (spec Behavior,
//! Errors and limits). Declared sizes are never trusted and nothing is written to disk.

use std::io::{Cursor, Read};

use zip::ZipArchive;

use crate::import::item::RawItem;
use crate::import::todoist::{ParseError, Seen, parse_csv, project_name};

/// Unpacked bytes read in total, across every entry.
const MAX_UNPACKED: u64 = 50 * 1024 * 1024;
/// Entries in the archive, of any kind.
const MAX_ENTRIES: usize = 500;

/// Items of every top-level `*.csv` entry, entries in name order, and how many of those
/// entries were not exports. Such entries are skipped; an archive with no export at all is
/// not an export.
pub(crate) fn parse_zip(bytes: &[u8], seen: &mut Seen) -> Result<(Vec<RawItem>, u32), ParseError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| ParseError::Unreadable)?;
    if archive.len() > MAX_ENTRIES {
        return Err(ParseError::TooLarge);
    }
    let mut csvs = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index_raw(index)
            .map_err(|_| ParseError::Unreadable)?;
        if entry.is_dir() || entry.encrypted() {
            continue;
        }
        let name = entry.name().map_err(|_| ParseError::Unreadable)?;
        if let Some(stem) = csv_stem(&name) {
            csvs.push((name.into_owned(), stem, index));
        }
    }
    csvs.sort();
    let mut left = MAX_UNPACKED;
    let mut items = Vec::new();
    let mut exports = 0;
    let mut skipped = 0;
    for (_, stem, index) in csvs {
        let entry = archive
            .by_index(index)
            .map_err(|_| ParseError::Unreadable)?;
        let mut data = Vec::new();
        // One byte past what is left shows the cap was crossed.
        entry
            .take(left + 1)
            .read_to_end(&mut data)
            .map_err(|_| ParseError::Unreadable)?;
        if data.len() as u64 > left {
            return Err(ParseError::TooLarge);
        }
        left -= data.len() as u64;
        match parse_csv(&project_name(&stem), &data, seen) {
            Ok(mut found) => {
                exports += 1;
                items.append(&mut found);
            }
            Err(ParseError::NotAnExport) => skipped += 1,
            Err(other) => return Err(other),
        }
    }
    if exports == 0 {
        return Err(ParseError::NotAnExport);
    }
    Ok((items, skipped))
}

/// The entry's name without `.csv`, when it is a top-level CSV outside `__MACOSX/`.
fn csv_stem(name: &str) -> Option<String> {
    if name.contains('/') || name.contains('\\') || name.starts_with("__MACOSX") {
        return None;
    }
    let cut = name.len().checked_sub(4)?;
    let (stem, ext) = (name.get(..cut)?, name.get(cut..)?);
    (ext.eq_ignore_ascii_case(".csv") && !stem.is_empty()).then(|| stem.to_owned())
}
