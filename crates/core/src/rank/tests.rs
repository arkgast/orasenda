use super::*;

#[test]
fn between_orders_strictly() {
    let f = first();
    let after = between(Some(&f), None);
    let before = between(None, Some(&f));
    let mid = between(Some(&f), Some(&after));
    assert!(before < f, "{before} < {f}");
    assert!(f < mid && mid < after, "{f} < {mid} < {after}");
    assert!(!before.is_empty());
    // A pair that differs only by a deeper digit still has room between.
    let a = "V".to_owned();
    let b = "V1".to_owned();
    let m = between(Some(&a), Some(&b));
    assert!(a < m && m < b, "{a} < {m} < {b}");
    // Adjacent single digits.
    let m = between(Some("1"), Some("2"));
    assert!("1" < m.as_str() && m.as_str() < "2");
    let m = between(None, Some("1"));
    assert!(m.as_str() < "1" && !m.is_empty());
}

#[test]
fn thousand_inserts_at_one_spot_stay_ordered() {
    // Always insert directly after the first card: the gap shrinks every time.
    let head = first();
    let mut list = vec![head.clone()];
    for _ in 0..1000 {
        let next = list.get(1).cloned();
        let r = between(Some(&head), next.as_deref());
        list.insert(1, r);
    }
    assert!(list.windows(2).all(|w| w[0] < w[1]), "strictly ascending");
    // And always insert at the very top.
    let mut top = vec![first()];
    for _ in 0..1000 {
        let r = between(None, Some(&top[0]));
        top.insert(0, r);
    }
    assert!(top.windows(2).all(|w| w[0] < w[1]), "strictly ascending");
    // And always at the end.
    let mut end = vec![first()];
    for _ in 0..1000 {
        let r = between(end.last().map(String::as_str), None);
        end.push(r);
    }
    assert!(end.windows(2).all(|w| w[0] < w[1]), "strictly ascending");
}

#[test]
fn ranks_never_end_in_the_lowest_digit() {
    let mut r = first();
    for _ in 0..200 {
        r = between(None, Some(&r));
        assert!(!r.ends_with('0'), "{r}");
    }
}

#[test]
fn a_reversed_pair_still_returns_a_rank_after_the_first() {
    let r = between(Some("b"), Some("a"));
    assert!(r.as_str() > "b");
}

#[test]
fn out_of_alphabet_bounds_never_panic() {
    let r = between(Some("z"), Some("~"));
    assert!(r.as_str() > "z", "{r}");
    let _ = between(Some("~"), Some("\u{7f}"));
    let _ = between(Some("~"), None);
}

#[test]
fn before_and_after_wrap_between() {
    let m = first();
    assert!(before(&m) < m);
    assert!(after(&m) > m);
}

#[test]
fn spread_is_increasing_and_after_bound() {
    for after in [None, Some("V"), Some("Vz1")] {
        for n in [1, 2, 61, 62, 63, 500, 3000] {
            let ranks = spread(after, n);
            assert_eq!(ranks.len(), n);
            let mut prev = after.unwrap_or("").to_owned();
            for r in &ranks {
                assert!(*r > prev, "{r} > {prev}");
                assert!(!r.ends_with('0'));
                prev = r.clone();
            }
        }
    }
}

#[test]
fn spread_stays_short_at_3000() {
    let after = "Vz1";
    for n in 1..=3000 {
        let ranks = spread(Some(after), n);
        assert_eq!(ranks.len(), n);
        assert!(ranks.iter().all(|r| r.len() <= after.len() + 2));
        assert!(ranks.windows(2).all(|w| w[0] < w[1]));
        assert!(ranks[0].as_str() > after);
    }
}

#[test]
fn spread_on_empty_lane() {
    assert!(spread(None, 0).is_empty());
    let ranks = spread(None, 500);
    assert_eq!(ranks.len(), 500);
    assert!(ranks.windows(2).all(|w| w[0] < w[1]));
    assert!(ranks[0].as_str() > "");
}

#[test]
fn spread_after_tombstone_rank() {
    let tomb = after("zzzz");
    let ranks = spread(Some(&tomb), 500);
    assert!(ranks.iter().all(|r| r.as_str() > tomb.as_str()));
    assert!(ranks.iter().all(|r| r.len() <= tomb.len() + 2));
    // A card can still be placed between the bound and the first spread rank.
    let m = between(Some(&tomb), Some(&ranks[0]));
    assert!(tomb < m && m < ranks[0]);
}

#[test]
fn spread_leaves_room_between_neighbours() {
    for n in [1, 2, 61, 62, 500, 3000] {
        let ranks = spread(None, n);
        assert!(ranks.iter().all(|r| !r.ends_with('0')));
        for w in ranks.windows(2) {
            let m = between(Some(&w[0]), Some(&w[1]));
            assert!(w[0] < m && m < w[1]);
            assert_eq!(m.len(), w[0].len());
        }
    }
}
