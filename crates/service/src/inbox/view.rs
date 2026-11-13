//! A stored note as the webview shows it: the time worded in local time.

use orasenda_core::LocalTime;
use orasenda_core::timer::format_clock;
use orasenda_store::inbox_notes::{NoteKind as StoredKind, NoteRow};

use crate::api::{NoteKind, NoteView};

const MINUTE_MS: i64 = 60_000;
const DAY_MS: i64 = 86_400_000;
const SHORT: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const LONG: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// The view of `row` as seen at `now_ms`, in the user's local time.
pub fn note_view(row: &NoteRow, now_ms: u64, local: &dyn LocalTime) -> NoteView {
    let offset = local.utc_offset_min(row.created_at);
    let clock = format_clock(row.created_at, offset, local.hour_cycle());
    let day = local_day(row.created_at, offset);
    let today = local_day(now_ms, local.utc_offset_min(now_ms));
    let (shown, spoken) = if day == today {
        (clock.clone(), format!("Today at {clock}"))
    } else if day + 1 == today {
        (
            format!("Yesterday {clock}"),
            format!("Yesterday at {clock}"),
        )
    } else {
        let (year, month, date) = civil(day);
        let (now_year, _, _) = civil(today);
        let m = usize::from(month - 1);
        let year_part = if year == now_year {
            String::new()
        } else {
            format!(" {year}")
        };
        (
            format!("{date} {}{year_part} {clock}", SHORT[m]),
            format!("{date} {}{year_part} at {clock}", LONG[m]),
        )
    };
    NoteView {
        id: row.id.clone(),
        text: row.text.clone(),
        kind: match row.kind {
            StoredKind::Internal => NoteKind::Internal,
            StoredKind::External => NoteKind::External,
        },
        created_at: shown,
        created_at_label: spoken,
    }
}

/// Days since 1970-01-01 of the local date of `epoch_ms`.
fn local_day(epoch_ms: u64, offset_min: i32) -> i64 {
    let ms = i64::try_from(epoch_ms).unwrap_or(i64::MAX / 2) + i64::from(offset_min) * MINUTE_MS;
    ms.div_euclid(DAY_MS)
}

/// The civil (year, month, day) of a day count since 1970-01-01 (Hinnant's algorithm).
fn civil(days: i64) -> (i64, u8, u8) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = u8::try_from(doy - (153 * mp + 2) / 5 + 1).unwrap_or(1);
    let month = u8::try_from(if mp < 10 { mp + 3 } else { mp - 9 }).unwrap_or(1);
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
