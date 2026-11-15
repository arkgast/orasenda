//! Pure helpers that turn EventKit values into `orasenda-core` import types.

use objc2_event_kit::EKAuthorizationStatus;
use orasenda_core::platform::import::{DueParts, SourceAccess};

/// `NSDateComponentUndefined`: a component the reminder does not set.
pub(super) const UNDEFINED: isize = isize::MAX;

/// What the OS's authorization status means for reading reminders.
pub fn access_from(status: EKAuthorizationStatus) -> SourceAccess {
    todo!("{status:?}")
}

/// The origin key: the external id, else `local-` + the local one.
pub fn item_id(external: Option<&str>, local: &str) -> String {
    todo!("{external:?} {local}")
}

/// A due date from date components; `None` unless year, month and day are all set.
pub fn due_parts(y: isize, m: isize, d: isize, h: isize, min: isize) -> Option<DueParts> {
    todo!("{y} {m} {d} {h} {min}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_from_maps_every_status() {
        for (status, want) in [
            (EKAuthorizationStatus::FullAccess, SourceAccess::Granted),
            (EKAuthorizationStatus::WriteOnly, SourceAccess::Denied),
            (EKAuthorizationStatus::Denied, SourceAccess::Denied),
            (EKAuthorizationStatus::Restricted, SourceAccess::Denied),
            (EKAuthorizationStatus::NotDetermined, SourceAccess::NotAsked),
        ] {
            assert_eq!(access_from(status), want, "{status:?}");
        }
    }

    #[test]
    fn access_from_unknown_is_unavailable() {
        assert_eq!(
            access_from(EKAuthorizationStatus(99)),
            SourceAccess::Unavailable
        );
    }

    #[test]
    fn item_id_prefers_external() {
        assert_eq!(item_id(Some("ext-1"), "L1"), "ext-1");
    }

    #[test]
    fn item_id_local_fallback() {
        assert_eq!(item_id(None, "L1"), "local-L1");
        assert_eq!(item_id(Some(""), "L1"), "local-L1");
    }

    #[test]
    fn due_parts_needs_year_month_day() {
        assert_eq!(due_parts(UNDEFINED, 11, 20, 9, 30), None);
        assert_eq!(due_parts(2026, UNDEFINED, 20, 9, 30), None);
        assert_eq!(due_parts(2026, 11, UNDEFINED, UNDEFINED, UNDEFINED), None);
        assert_eq!(
            due_parts(2026, 11, 20, UNDEFINED, UNDEFINED),
            Some(DueParts {
                date: Some("2026-11-20".into()),
                time: None
            })
        );
    }

    #[test]
    fn due_parts_time_optional() {
        let with = due_parts(2026, 1, 5, 9, 7).unwrap();
        assert_eq!(with.date.as_deref(), Some("2026-01-05"));
        assert_eq!(with.time.as_deref(), Some("09:07"));
        // An hour without a minute is not a time.
        assert_eq!(due_parts(2026, 1, 5, 9, UNDEFINED).unwrap().time, None);
    }
}
