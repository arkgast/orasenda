use super::*;
use crate::api::{BoardError, ColumnSettings};

fn cols(today: u8, doing: u8) -> Vec<ColumnSettings> {
    let c = |lane, name: &str, limit| ColumnSettings {
        lane,
        name: name.into(),
        limit,
    };
    vec![
        c(Lane::Backlog, "Later", None),
        c(Lane::Today, " Now ", Some(today)),
        c(Lane::Doing, "Busy", Some(doing)),
        c(Lane::Done, "Finished", None),
    ]
}

#[test]
fn columns_are_saved_trimmed_and_shown() {
    let host = host();
    run_board_columns_set(&host, cols(5, 2)).expect("saves");
    let board = run_board_get(&host).expect("reads");
    let shown: Vec<_> = board
        .columns
        .iter()
        .map(|c| (c.name.as_str(), c.limit))
        .collect();
    assert_eq!(
        shown,
        [
            ("Later", None),
            ("Now", Some(5)),
            ("Busy", Some(2)),
            ("Finished", None)
        ]
    );
    assert_eq!(changed(&host).len(), 1);
}

#[test]
fn columns_refuse_bad_input() {
    let host = host();
    for bad in [cols(0, 1), cols(10, 1), cols(3, 0), cols(3, 4)] {
        assert_eq!(
            run_board_columns_set(&host, bad),
            Err(BoardError::BadColumns)
        );
    }
    let mut blank = cols(3, 1);
    blank[0].name = "  ".into();
    assert_eq!(
        run_board_columns_set(&host, blank),
        Err(BoardError::BadColumns)
    );
    let mut long = cols(3, 1);
    long[3].name = "x".repeat(25);
    assert_eq!(
        run_board_columns_set(&host, long),
        Err(BoardError::BadColumns)
    );
    let mut limit = cols(3, 1);
    limit[0].limit = Some(2);
    assert_eq!(
        run_board_columns_set(&host, limit),
        Err(BoardError::BadColumns)
    );
    assert_eq!(
        run_board_columns_set(&host, cols(3, 1)[..3].to_vec()),
        Err(BoardError::BadColumns)
    );
    assert_eq!(
        lane(&run_board_get(&host).unwrap(), Lane::Today).name,
        "Today"
    );
}
