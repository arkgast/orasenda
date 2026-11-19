use super::*;

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
