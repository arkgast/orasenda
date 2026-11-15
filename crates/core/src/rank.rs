//! Fractional indexes: sortable strings that let a card move between two others by writing one
//! row, with no renumbering.
//!
//! A rank reads as a base-62 fraction (`0.rank`) over the digits `0-9A-Za-z`, which are in
//! ASCII order, so plain string comparison orders ranks. A rank never ends in `0`, which
//! keeps room before it. Pure: no clock, no I/O.

const DIGITS: &[u8; 62] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE: usize = DIGITS.len();

/// A rank above `b` (the top of the lane).
pub fn before(b: &str) -> String {
    between(None, Some(b))
}

/// A rank below `a` (the end of the lane).
pub fn after(a: &str) -> String {
    between(Some(a), None)
}

/// The rank of the first card in an empty lane.
pub fn first() -> String {
    between(None, None)
}

/// `n` increasing ranks after `after` (`None` for an empty lane), evenly packed.
///
/// Each rank is `after` plus the fewest digits that fit `n` ranks (one digit up to 61, two up
/// to 3782), so for `n <= 3000` it is at most `after.len() + 2` long. Repeating [`after`]
/// instead halves the gap each time and grows the string. No rank ends in `0`.
pub fn spread(after: Option<&str>, n: usize) -> Vec<String> {
    let head = after.unwrap_or("");
    let (mut places, mut room) = (1, BASE - 1);
    while room < n {
        places += 1;
        room *= BASE;
    }
    (0..n)
        .map(|i| {
            // Skip every value that ends in digit 0, then write it in base 62.
            let mut v = i / (BASE - 1) * BASE + i % (BASE - 1) + 1;
            let mut tail = vec![DIGITS[0]; places];
            for slot in tail.iter_mut().rev() {
                *slot = DIGITS[v % BASE];
                v /= BASE;
            }
            head.to_owned() + &String::from_utf8_lossy(&tail)
        })
        .collect()
}

/// A rank strictly between `a` (above, `None` for the top) and `b` (below, `None` for the
/// end), when `a < b`.
///
/// Bounds outside the alphabet `0-9A-Za-z` still give a valid rank, but its position between
/// them is not guaranteed.
///
/// Precondition: `a < b`. If it does not hold (two devices produced equal ranks), the result
/// is still a valid rank, placed after `a`.
pub fn between(a: Option<&str>, b: Option<&str>) -> String {
    let a = a.unwrap_or("");
    let b = b.filter(|b| a < *b);
    midpoint(a.as_bytes(), b.map(str::as_bytes))
}

fn digit(bytes: &[u8], at: usize) -> usize {
    bytes
        .get(at)
        .and_then(|c| DIGITS.iter().position(|d| d == c))
        .unwrap_or(0)
}

/// A rank above `a` (a fraction, `""` is zero) and below `b` (`None` is one).
fn midpoint(a: &[u8], b: Option<&[u8]>) -> String {
    if let Some(b) = b {
        // Keep the shared prefix (reading `a` as padded with zeros) and work on the rest.
        let shared = (0..b.len())
            .take_while(|&i| a.get(i).copied().unwrap_or(DIGITS[0]) == b[i])
            .count();
        if shared > 0 {
            let head = String::from_utf8_lossy(&b[..shared]).into_owned();
            let rest_a = a.get(shared..).unwrap_or_default();
            return head + &midpoint(rest_a, Some(&b[shared..]));
        }
    }
    let low = digit(a, 0);
    let high = b.map_or(BASE, |b| digit(b, 0));
    if high.saturating_sub(low) > 1 {
        return char::from(DIGITS[(low + high).div_ceil(2)]).to_string();
    }
    // Neighbouring digits: either cut `b` short, or step into the next place.
    if let Some(b) = b
        && b.len() > 1
    {
        return char::from(b[0]).to_string();
    }
    let rest = a.get(1..).unwrap_or_default();
    char::from(DIGITS[low]).to_string() + &midpoint(rest, None)
}

#[cfg(test)]
mod tests;
