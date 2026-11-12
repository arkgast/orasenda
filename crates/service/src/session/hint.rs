//! The keep-going hint: one quiet line after the first manual "+10 min" (spec: Today polish).
//! The flag lives in memory; only "shown once" is stored, in the device-only `meta` table.

use orasenda_store::meta;

use super::*;
use crate::api::Hint;

/// The `meta` key holding when the hint was shown (RFC 3339, UTC).
pub(super) const META_HINT_KEEP_GOING: &str = "hint.keep_going";

/// Whether the hint was shown before.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(super) enum Seen {
    #[default]
    No,
    Yes,
    /// The read failed or there is no store: the hint is never set, so it can't repeat.
    Unknown,
}

#[derive(Debug, Default)]
pub(super) struct HintState {
    /// A manual extend happened in this focus and the hint has not been shown yet.
    pub(super) pending: bool,
    pub(super) seen: Seen,
}

impl SessionService {
    /// The startup read of `hint.keep_going`.
    pub(super) fn load_hint(&mut self) {
        let Some(store) = &self.store else {
            self.hint.seen = Seen::Unknown;
            return;
        };
        self.hint.seen = match store.read(|txn| meta::get(txn, META_HINT_KEEP_GOING)) {
            Ok(None) => Seen::No,
            Ok(Some(_)) => Seen::Yes,
            Err(error) => {
                eprintln!("hint: {META_HINT_KEEP_GOING} could not be read ({error}); no hint");
                Seen::Unknown
            }
        };
    }

    /// A manual "+10 min" went through.
    pub(super) fn note_manual_extend(&mut self) {
        if self.hint.seen == Seen::No && !self.settings.auto_continue {
            self.hint.pending = true;
        }
    }

    /// The hint for the view.
    pub(super) fn hint_due(&self) -> Option<Hint> {
        (self.hint.pending && !self.settings.auto_continue).then_some(Hint::KeepGoing)
    }

    /// Today showed the hint. It clears for this run whatever happens; a failed write is
    /// logged here and shown by the store status.
    pub(super) fn mark_shown(&mut self, _hint: Hint, now_ms: u64) {
        if !self.hint.pending {
            return;
        }
        self.hint.pending = false;
        self.hint.seen = Seen::Yes;
        let stamp = rfc3339_utc(now_ms);
        if let Err(error) =
            self.write_owed(now_ms, |txn| meta::set(txn, META_HINT_KEEP_GOING, &stamp))
        {
            eprintln!(
                "hint: could not remember {META_HINT_KEEP_GOING} ({error}); hidden for this run"
            );
        }
    }
}

/// `epoch_ms` as `YYYY-MM-DDTHH:MM:SSZ`.
fn rfc3339_utc(epoch_ms: u64) -> String {
    let secs = epoch_ms / 1000;
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // Days since 1970-01-01 to a civil date (Hinnant's algorithm).
    let z = i64::try_from(days).unwrap_or(0) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::rfc3339_utc;

    #[test]
    fn rfc3339_utc_exact_values() {
        assert_eq!(rfc3339_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339_utc(1_709_208_000_000), "2024-02-29T12:00:00Z");
        assert_eq!(rfc3339_utc(1_704_067_199_000), "2023-12-31T23:59:59Z");
    }
}
