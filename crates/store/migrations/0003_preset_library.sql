-- Session cadence E1: the preset library. Syncable: change_log.entity = 'preset'.
CREATE TABLE preset (
    id             TEXT PRIMARY KEY, -- UUIDv7 (a default's fixed id)
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    deleted_at     INTEGER NULL,
    name           TEXT NOT NULL,
    focus_min      INTEGER NOT NULL,
    break_min      INTEGER NOT NULL,
    long_break_min INTEGER NOT NULL,
    rounds         INTEGER NOT NULL,
    position       INTEGER NOT NULL,
    default_key    TEXT NULL
);

-- The snapshot of the preset a session started with, and its break kind. Old rows keep NULLs.
ALTER TABLE focus_session ADD COLUMN preset_id TEXT NULL;
ALTER TABLE focus_session ADD COLUMN preset_name TEXT NULL;
ALTER TABLE focus_session ADD COLUMN focus_min INTEGER NULL;
ALTER TABLE focus_session ADD COLUMN break_min INTEGER NULL;
ALTER TABLE focus_session ADD COLUMN long_break_min INTEGER NULL;
ALTER TABLE focus_session ADD COLUMN rounds INTEGER NULL;
ALTER TABLE focus_session ADD COLUMN break_kind TEXT NULL; -- 'short' | 'long'

-- A live session in the old shape cannot resume in the new one.
DELETE FROM active_session;

-- The service seeds the three defaults while this marker is pending, then removes it.
INSERT INTO meta (key, value) VALUES ('preset_seed', 'pending');
