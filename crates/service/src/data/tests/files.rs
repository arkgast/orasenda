use super::super::files::export_name;

#[test]
fn export_name_uses_the_local_date() {
    let midnight_utc = 1_794_009_600_000; // 2026-11-07 00:00 UTC
    assert_eq!(export_name(midnight_utc, 0), "Orasenda data 2026-11-07.db");
    // Still the 6th in Los Angeles; already the 7th in Auckland and Kiritimati.
    assert_eq!(
        export_name(midnight_utc, -480),
        "Orasenda data 2026-11-06.db"
    );
    assert_eq!(
        export_name(midnight_utc, 780),
        "Orasenda data 2026-11-07.db"
    );
    assert_eq!(
        export_name(midnight_utc - 1, 840),
        "Orasenda data 2026-11-07.db"
    );
    assert_eq!(
        export_name(midnight_utc - 1, 0),
        "Orasenda data 2026-11-06.db"
    );
}
