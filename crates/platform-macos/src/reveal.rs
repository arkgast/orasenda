//! Shows a file or folder in Finder (`NSWorkspace.activateFileViewerSelectingURLs`).

use std::path::Path;

use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSArray, NSString, NSURL};
use orasenda_core::platform::PlatformError;

/// Selects `path` in a Finder window and brings Finder forward. Any thread may call it.
/// A path that is not valid text, or does not exist, is refused.
pub fn reveal_in_finder(path: &Path) -> Result<(), PlatformError> {
    let text = path
        .to_str()
        .ok_or_else(|| PlatformError::Other("the path is not valid text".into()))?;
    if !path.exists() {
        return Err(PlatformError::Refused);
    }
    let url = NSURL::fileURLWithPath(&NSString::from_str(text));
    NSWorkspace::sharedWorkspace().activateFileViewerSelectingURLs(&NSArray::from_slice(&[&*url]));
    Ok(())
}
