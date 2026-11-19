use super::*;
use crate::api::BoardError;

#[test]
fn api_lane_deserialize_validates() {
    let ok: Lane = serde_json::from_str("\"today\"").expect("a built-in");
    assert_eq!(ok, Lane::TODAY);
    let custom: Lane = serde_json::from_str("\"c_ab12cd34\"").expect("a custom id");
    assert_eq!(custom.as_str(), "c_ab12cd34");
    assert_eq!(
        serde_json::to_string(&custom).expect("writes"),
        "\"c_ab12cd34\""
    );
    for bad in ["\"c_AB\"", "\"C_AB12CD34\"", "\"\"", "\"nowhere\""] {
        serde_json::from_str::<Lane>(bad).expect_err(bad);
    }
}

#[test]
fn service_refuses_custom_lane_for_now() {
    let host = host();
    let custom = Lane::parse("c_ab12cd34").expect("a custom id");
    assert_eq!(
        run_task_add(&host, draft("A", custom.clone())),
        Err(BoardError::BadColumns)
    );
    assert!(changed(&host).is_empty());
    let a = add(&host, "A", Lane::BACKLOG);
    changed(&host);
    assert_eq!(
        run_task_move(&host, &a.id, custom, 0),
        Err(BoardError::BadColumns)
    );
    assert!(changed(&host).is_empty());
}
