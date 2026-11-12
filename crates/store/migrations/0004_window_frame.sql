-- Device-only (ADR-012): window positions never sync and never write change_log.
CREATE TABLE window_frame (
    window     TEXT    NOT NULL,
    display    TEXT    NOT NULL,
    x          INTEGER NOT NULL,
    y          INTEGER NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (window, display)
);
