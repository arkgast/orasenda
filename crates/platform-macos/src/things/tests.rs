use orasenda_core::platform::import::ThingsReadError;

use super::error_from_stderr;

#[test]
fn stderr_1743_is_denied() {
    let text = "execution error: Error: Error: Not authorized to send Apple events to Things3. (-1743)";
    assert_eq!(error_from_stderr(text), ThingsReadError::Denied);
}

#[test]
fn stderr_600_is_not_installed() {
    let text = "execution error: Application isn't running. (-600)";
    assert_eq!(error_from_stderr(text), ThingsReadError::NotInstalled);
    let text = "execution error: Can't find application \"Things3\".";
    assert_eq!(error_from_stderr(text), ThingsReadError::NotInstalled);
}

#[test]
fn stderr_1728_is_failed() {
    let text = "execution error: Error: Can't get object. (-1728)";
    assert!(matches!(error_from_stderr(text), ThingsReadError::Failed(_)));
}

#[test]
fn stderr_unknown_is_failed() {
    assert!(matches!(error_from_stderr("boom"), ThingsReadError::Failed(_)));
    assert!(matches!(error_from_stderr(""), ThingsReadError::Failed(_)));
}

#[test]
fn script_has_no_shell_or_file_access() {
    let js = super::THINGS_COLLECT_JS;
    for banned in ["doShellScript", "includeStandardAdditions", "readFile", "$.NS", "ObjC", "Library("] {
        assert!(!js.contains(banned), "things.js must not contain {banned}");
    }
    assert!(js.contains("function collect(app)"));
    assert_eq!(js.matches("function ").count(), js.matches("function collect(app)").count() + js.matches("function day(").count());
}
