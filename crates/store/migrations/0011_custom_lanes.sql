-- Custom board columns (spec 2026-11-18). SQLite cannot alter a CHECK, so task is rebuilt with
-- the lane CHECK relaxed: the four built-in lanes, or a custom id `c_` plus 8 characters of
-- 0-9a-z. Every other column and CHECK repeats 0008_board.sql and 0009_task_origin.sql. Every
-- row is copied as it is; nothing is back-filled and change_log is untouched. There are no
-- triggers or foreign keys on task.
CREATE TABLE task_new (
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
    lane                TEXT    NOT NULL CHECK (
        lane IN ('backlog', 'today', 'doing', 'done')
        OR (length(lane) = 10 AND lane GLOB 'c_*' AND substr(lane, 3) NOT GLOB '*[^0-9a-z]*')),
    rank                TEXT    NOT NULL CHECK (length(rank) > 0 AND rank NOT GLOB '*[^0-9A-Za-z]*'),
    frog_day            TEXT    CHECK (frog_day IS NULL OR frog_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    breakdown_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (breakdown_dismissed IN (0, 1)),
    source_note_id      TEXT,
    done_at             INTEGER,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    origin              TEXT
        CHECK (origin IS NULL OR (length(origin) BETWEEN 3 AND 300 AND instr(origin, ':') > 1))
);

INSERT INTO task_new (id, title, notes, tags, kind, estimate, due, priority, checklist, lane,
                      rank, frog_day, breakdown_dismissed, source_note_id, done_at, created_at,
                      updated_at, deleted_at, origin)
SELECT id, title, notes, tags, kind, estimate, due, priority, checklist, lane,
       rank, frog_day, breakdown_dismissed, source_note_id, done_at, created_at,
       updated_at, deleted_at, origin
FROM task;

DROP TABLE task;
ALTER TABLE task_new RENAME TO task;

CREATE INDEX task_live ON task (deleted_at, lane, rank);
CREATE INDEX task_origin ON task (origin) WHERE origin IS NOT NULL;
