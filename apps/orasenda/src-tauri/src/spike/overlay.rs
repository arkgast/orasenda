//! Which [`OverlayStrategy`] the spike overlay uses. A single `const` so the manual matrix
//! (#18) can switch it in one line.

use orasenda_platform_macos::OverlayStrategy;

/// The overlay strategy the spike uses. `LevelAndCollection` is always applied; a different
/// value here is layered on top of it (`NonActivatingPanel` at setup,
/// `AccessoryPolicy` while the overlay shows).
///
/// `NonActivatingPanel` is the default because it is the only one tested that shows above a
/// full-screen app on its own Space. `LevelAndCollection` alone shows above windowed apps
/// only: over a full-screen app it appears on another Space and the app stays usable.
/// `AccessoryPolicy` was not needed. See `docs/spikes/2026-11-07-macos-blocking.md` (#18).
pub(crate) const OVERLAY_STRATEGY: OverlayStrategy = OverlayStrategy::NonActivatingPanel;
