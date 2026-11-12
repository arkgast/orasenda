//! Pure window geometry: where a remembered frame goes, and where a new one starts.
//!
//! Every frame is in integer points relative to the display frame's top-left (y grows
//! downward), and `visible` is the display's `visibleFrame` in that space. The platform crate
//! converts from AppKit's bottom-left global coordinates; nothing here knows about it.

/// A window frame in points.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Frame {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// The sizes a window may have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub min_width: u32,
    pub min_height: u32,
    pub max_width: u32,
    pub max_height: u32,
}

/// `stored`, made to fit: clamped to `limits` (and to `visible` when that is smaller), then
/// moved inside `visible` keeping its size. A frame that already fits is returned unchanged.
pub fn frame_within(_stored: Frame, _visible: Frame, _limits: Limits) -> Frame {
    todo!()
}

/// The top-right of `visible`, `inset` points from its top and right edges, for a window of
/// `size` (width, height).
pub fn default_frame(_visible: Frame, _size: (u32, u32), _inset: u32) -> Frame {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VISIBLE: Frame = Frame {
        x: 0,
        y: 25,
        width: 1440,
        height: 850,
    };
    const LIMITS: Limits = Limits {
        min_width: 280,
        min_height: 56,
        max_width: 360,
        max_height: 96,
    };

    fn at(x: i32, y: i32, width: u32, height: u32) -> Frame {
        Frame {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn frame_within_clamps_oversize() {
        assert_eq!(
            frame_within(at(100, 100, 900, 700), VISIBLE, LIMITS),
            at(100, 100, 360, 96)
        );
        assert_eq!(
            frame_within(at(100, 100, 10, 10), VISIBLE, LIMITS),
            at(100, 100, 280, 56)
        );
    }

    #[test]
    fn frame_within_moves_offscreen_inside() {
        // Past the right and bottom edges: keeps its size, ends flush with them.
        assert_eq!(
            frame_within(at(5_000, 5_000, 280, 64), VISIBLE, LIMITS),
            at(1440 - 280, 25 + 850 - 64, 280, 64)
        );
        // Before the left and top edges (a display to the left or above, now gone).
        assert_eq!(
            frame_within(at(-2_000, -300, 280, 64), VISIBLE, LIMITS),
            at(0, 25, 280, 64)
        );
        // Partly outside: only the overhang moves.
        assert_eq!(
            frame_within(at(1_300, 100, 280, 64), VISIBLE, LIMITS),
            at(1440 - 280, 100, 280, 64)
        );
    }

    #[test]
    fn frame_within_keeps_fitting_frame() {
        let fits = at(1_040, 40, 280, 64);
        assert_eq!(frame_within(fits, VISIBLE, LIMITS), fits);
        let flush = at(0, 25, 360, 96);
        assert_eq!(frame_within(flush, VISIBLE, LIMITS), flush);
    }

    #[test]
    fn frame_within_a_small_display_never_exceeds_it() {
        let tiny = at(0, 0, 200, 40);
        assert_eq!(
            frame_within(at(50, 50, 280, 64), tiny, LIMITS),
            at(0, 0, 200, 40)
        );
    }

    #[test]
    fn default_frame_top_right_inset() {
        assert_eq!(
            default_frame(VISIBLE, (280, 64), 16),
            at(1440 - 280 - 16, 25 + 16, 280, 64)
        );
        // A visible frame that does not start at the origin.
        let second = at(1_440, 0, 1_920, 1_055);
        assert_eq!(
            default_frame(second, (280, 64), 0),
            at(1_440 + 1_920 - 280, 0, 280, 64)
        );
    }
}
