//! Backup file names: `orasenda-<YYYYMMDD>T<HHMMSS>Z-<kind>.db`, with `-2`, `-3` for a clash.
//! Time is UTC from the caller's clock; there is no local calendar here.

use std::path::Path;

use crate::api::BackupKind;

const KINDS: [(BackupKind, &str); 4] = [
    (BackupKind::Auto, "auto"),
    (BackupKind::Manual, "manual"),
    (BackupKind::BeforeImport, "before-import"),
    (BackupKind::BeforeRestore, "before-restore"),
];

fn kind_text(kind: BackupKind) -> &'static str {
    KINDS
        .iter()
        .find(|(k, _)| *k == kind)
        .map_or("manual", |(_, text)| text)
}

/// The name without a suffix, e.g. `orasenda-20261103T091200Z-manual.db`.
fn base(now_ms: u64, kind: BackupKind) -> String {
    stem(now_ms, kind) + ".db"
}

fn stem(now_ms: u64, kind: BackupKind) -> String {
    let secs = now_ms / 1000;
    let (year, month, day) = civil_from_days(secs / 86_400);
    let rem = secs % 86_400;
    format!(
        "orasenda-{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z-{}",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        kind_text(kind)
    )
}

/// A name in `backups` for the second of `now_ms` that no file has yet.
pub(super) fn unique(backups: &Path, now_ms: u64, kind: BackupKind) -> String {
    let first = base(now_ms, kind);
    if !backups.join(&first).exists() {
        return first;
    }
    let stem = stem(now_ms, kind);
    (2u32..)
        .map(|n| format!("{stem}-{n}.db"))
        .find(|name| !backups.join(name).exists())
        .unwrap_or(first)
}

/// The time (second precision), kind and clash number (1 when none) a backup name carries, or
/// `None` for any other name.
pub(super) fn parse(name: &str) -> Option<(u64, BackupKind, u32)> {
    let rest = name.strip_prefix("orasenda-")?.strip_suffix(".db")?;
    let (time, after) = rest.split_once('Z')?;
    let (date, clock) = time.split_once('T')?;
    if date.len() != 8
        || clock.len() != 6
        || !(date.bytes().chain(clock.bytes())).all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let number = |text: &str| text.parse::<u64>().ok();
    let (year, month, day) = (
        number(&date[..4])?,
        number(&date[4..6])?,
        number(&date[6..])?,
    );
    let (hour, minute, second) = (
        number(&clock[..2])?,
        number(&clock[2..4])?,
        number(&clock[4..])?,
    );
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }
    let ms =
        (days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second) * 1000;
    let tail = after.strip_prefix('-')?;
    let (kind, number) = KINDS.iter().find_map(|(kind, text)| {
        if tail == *text {
            return Some((*kind, 1));
        }
        let n = tail.strip_prefix(text)?.strip_prefix('-')?;
        let value = n.parse::<u32>().ok()?;
        (n.bytes().all(|b| b.is_ascii_digit()) && value >= 2 && !n.starts_with('0'))
            .then_some((*kind, value))
    })?;
    // A date like 31 February parses digit by digit but names no day: it must round-trip.
    (stem(ms, kind)[..25] == name[..25]).then_some((ms, kind, number))
}

/// Days since 1970-01-01 to (year, month, day) (Hinnant's algorithm).
fn civil_from_days(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + u64::from(month <= 2), month, day)
}

fn days_from_civil(year: u64, month: u64, day: u64) -> u64 {
    let year = if month <= 2 {
        year.saturating_sub(1)
    } else {
        year
    };
    let era = year / 400;
    let yoe = year % 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    (era * 146_097 + doe).saturating_sub(719_468)
}
