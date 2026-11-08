//! Which [`OverlayStrategy`] the spike overlay uses. A single `const` so the manual matrix
//! (#18) can switch it in one line.

use orasenda_platform_macos::OverlayStrategy;

/// The overlay strategy under test. `LevelAndCollection` is always applied; a different
/// value here is layered on top of it (`NonActivatingPanel` at setup,
/// `AccessoryPolicy` while the overlay shows).
pub(crate) const OVERLAY_STRATEGY: OverlayStrategy = OverlayStrategy::LevelAndCollection;
