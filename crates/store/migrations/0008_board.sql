-- The Board (P2, spec 2026-11-14). task is syncable (ADR-012): every write logs change_log with
-- entity 'task'. Removal is a tombstone (deleted_at), never a deleted row. There are no
-- REFERENCES clauses: foreign keys are off in this store, and a later sync may deliver a
-- referencing row first.

-- lane (not "column", beside ADD COLUMN) is one of the four fixed board columns. rank is a
-- fractional index within the lane (0-9A-Za-z, compared as plain text). tags and checklist are
-- JSON arrays the repository writes; the CHECKs are the last line. Tracked time is derived from
-- focus_session.task_id and never stored here.
CREATE TABLE task (
    id                  TEXT    PRIMARY KEY, -- UUIDv7
    title               TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    notes               TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
    tags                TEXT    NOT NULL DEFAULT '[]'
        CHECK (json_valid(tags) AND json_type(tags) = 'array' AND json_array_length(tags) <= 8),
    kind                TEXT    NOT NULL DEFAULT 'deep' CHECK (kind IN ('deep', 'shallow')),
    estimate            INTEGER CHECK (estimate BETWEEN 1 AND 16),
    due                 TEXT    CHECK (due IS NULL OR due GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    priority            TEXT    CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low')),
    checklist           TEXT    NOT NULL DEFAULT '[]'
        CHECK (json_valid(checklist) AND json_type(checklist) = 'array'
               AND json_array_length(checklist) <= 30),
    lane                TEXT    NOT NULL CHECK (lane IN ('backlog', 'today', 'doing', 'done')),
    rank                TEXT    NOT NULL CHECK (length(rank) > 0 AND rank NOT GLOB '*[^0-9A-Za-z]*'),
    frog_day            TEXT    CHECK (frog_day IS NULL OR frog_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    breakdown_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (breakdown_dismissed IN (0, 1)),
    source_note_id      TEXT,
    done_at             INTEGER,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER
);

CREATE INDEX task_live ON task (deleted_at, lane, rank);

-- The task a session was linked to when its row was written. Old rows stay NULL.
ALTER TABLE focus_session ADD COLUMN task_id TEXT NULL;

CREATE INDEX focus_session_task ON focus_session (task_id);
