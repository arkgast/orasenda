-- Orasenda schema v1 (ADR-002 as amended by ADR-012). PRAGMA user_version is the only schema
-- version; the runner sets it after this file.

-- device_id (written once, from Store::open) and hlc_last (the clock's last stamp).
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- One row per changed field of a syncable entity, in the same transaction as the row.
CREATE TABLE change_log (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    hlc       TEXT NOT NULL,
    device_id TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field     TEXT NOT NULL,
    value     TEXT NOT NULL, -- JSON
    synced_at INTEGER NULL
);

-- Syncable: change_log.entity = 'setting', entity_id = key.
CREATE TABLE setting (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL, -- JSON
    updated_at INTEGER NOT NULL
);

-- Syncable, append-only: inserted once when the session ends, never updated.
CREATE TABLE focus_session (
    id              TEXT PRIMARY KEY, -- UUIDv7
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER NULL,
    preset          TEXT NOT NULL,
    phase           TEXT NOT NULL,
    planned_ms      INTEGER NOT NULL,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER NOT NULL,
    paused_total_ms INTEGER NOT NULL,
    focused_ms      INTEGER NOT NULL,
    end_reason      TEXT NOT NULL,
    extensions      INTEGER NOT NULL DEFAULT 0,
    intent          TEXT NULL
);

-- Device-only: the live session, no change_log rows.
CREATE TABLE active_session (
    singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
    snapshot   TEXT NOT NULL, -- JSON Session
    updated_at INTEGER NOT NULL
);
