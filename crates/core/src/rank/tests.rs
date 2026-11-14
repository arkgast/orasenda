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
