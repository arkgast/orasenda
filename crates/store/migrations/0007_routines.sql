-- Routines and habits (P4, spec 2026-11-14). All four tables are syncable (ADR-012): every
-- write logs change_log with the table name as the entity. Removal is a tombstone
-- (deleted_at), never a deleted row. There are no REFERENCES clauses: foreign keys are off in
-- this store, tombstoned parents stay as rows, and a later sync may deliver a child first.

-- An ordered list of habits. time_of_day is minutes after local midnight (NULL: any time);
-- days is a weekday mask, Monday = 1 ... Sunday = 64.
CREATE TABLE routine (
    id          TEXT    PRIMARY KEY, -- UUIDv7
    name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    time_of_day INTEGER CHECK (time_of_day BETWEEN 0 AND 1439),
    days        INTEGER NOT NULL DEFAULT 127 CHECK (days BETWEEN 1 AND 127),
    template    TEXT    CHECK (template IS NULL OR length(template) BETWEEN 1 AND 40),
    position    INTEGER NOT NULL CHECK (position >= 0),
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
);

CREATE INDEX routine_live ON routine (deleted_at, position, id);

-- A habit sits in one routine (routine_id) or stands alone (routine_id NULL). Only a
-- standalone habit has its own days.
CREATE TABLE habit (
    id         TEXT    PRIMARY KEY, -- UUIDv7
    routine_id TEXT,
    position   INTEGER NOT NULL CHECK (position >= 0),
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    when_text  TEXT    CHECK (when_text IS NULL OR length(when_text) BETWEEN 1 AND 80),
    where_text TEXT    CHECK (where_text IS NULL OR length(where_text) BETWEEN 1 AND 80),
    anchor     TEXT    CHECK (anchor IS NULL OR length(anchor) BETWEEN 1 AND 120),
    two_minute TEXT    CHECK (two_minute IS NULL OR length(two_minute) BETWEEN 1 AND 120),
    identity   TEXT    CHECK (identity IS NULL OR length(identity) BETWEEN 1 AND 120),
    optional   INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1)),
    days       INTEGER CHECK (days BETWEEN 1 AND 127),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    CHECK (routine_id IS NULL OR days IS NULL)
);

CREATE INDEX habit_live ON habit (routine_id, deleted_at, position, id);

-- A check-in: this habit was done on this local date. The id is '<habit_id>:<YYYY-MM-DD>', so
-- two devices that check in on the same day agree. A tombstone sets checked_at to the removal
-- time, so the merge can compare checked_at alone.
CREATE TABLE habit_check (
    id         TEXT    PRIMARY KEY CHECK (id = habit_id || ':' || day),
    habit_id   TEXT    NOT NULL,
    day        TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    checked_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX habit_check_day ON habit_check (habit_id, day);

-- One pass through a routine. step_ids are the habit ids in run order, frozen at start;
-- answers are 'done' or 'skipped' for each answered step, in order. ended_at and outcome are
-- set together when the run ends.
CREATE TABLE routine_run (
    id            TEXT    PRIMARY KEY, -- UUIDv7
    routine_id    TEXT    NOT NULL,
    day           TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    outcome       TEXT    CHECK (outcome IN ('finished', 'stopped')),
    steps_total   INTEGER NOT NULL CHECK (steps_total >= 0),
    steps_done    INTEGER NOT NULL DEFAULT 0 CHECK (steps_done >= 0),
    steps_skipped INTEGER NOT NULL DEFAULT 0 CHECK (steps_skipped >= 0),
    step_ids      TEXT    NOT NULL CHECK (json_valid(step_ids) AND json_type(step_ids) = 'array'),
    answers       TEXT    NOT NULL DEFAULT '[]'
                  CHECK (json_valid(answers) AND json_type(answers) = 'array'),
    updated_at    INTEGER NOT NULL,
    CHECK ((ended_at IS NULL) = (outcome IS NULL)),
    CHECK (steps_total = json_array_length(step_ids)),
    CHECK (steps_done + steps_skipped = json_array_length(answers)),
    CHECK (steps_done + steps_skipped <= steps_total)
);

CREATE INDEX routine_run_routine ON routine_run (routine_id, ended_at, started_at);
CREATE INDEX routine_run_day ON routine_run (day);
