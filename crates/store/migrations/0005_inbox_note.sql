-- Syncable (ADR-012): every write logs change_log with entity 'inbox_note'. A removed note is
-- a tombstone (deleted_at), never a deleted row.
CREATE TABLE inbox_note (
    id         TEXT    PRIMARY KEY, -- UUIDv7
    text       TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
    kind       TEXT    NOT NULL CHECK (kind IN ('internal', 'external')),
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX inbox_note_live ON inbox_note (deleted_at, created_at DESC);
