use std::sync::Arc;

use super::*;

#[test]
fn sources_are_object_safe() {
    let r: Arc<dyn RemindersSource> = Arc::new(UnbundledReminders);
    assert_eq!(r.access(), SourceAccess::Unavailable);
    struct T;
    impl ThingsSource for T {
        fn installed(&self) -> bool {
            false
        }
        fn read(&self) -> Result<String, ThingsReadError> {
            Err(ThingsReadError::NotInstalled)
        }
        fn open_settings(&self) -> Result<(), PlatformError> {
            Err(PlatformError::Unsupported)
        }
    }
    let t: Arc<dyn ThingsSource> = Arc::new(T);
    assert_eq!(t.read(), Err(ThingsReadError::NotInstalled));
}

#[test]
fn unbundled_reminders_is_unavailable() {
    assert_eq!(UnbundledReminders.access(), SourceAccess::Unavailable);
    assert_eq!(UnbundledReminders.request(), SourceAccess::Unavailable);
    assert_eq!(UnbundledReminders.read(), Err(PlatformError::Unsupported));
    assert_eq!(
        UnbundledReminders.open_settings(),
        Err(PlatformError::Unsupported)
    );
}
