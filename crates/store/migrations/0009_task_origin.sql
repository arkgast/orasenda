-- Task origin (spec 2026-11-15, task import). Where an imported task came from, `<source>:<key>`.
-- Set once at import, never edited, synced and merged like every other task field. Existing rows
-- get NULL; nothing is back-filled. The partial index serves the import's "already on the
-- Board" lookup.
ALTER TABLE task ADD COLUMN origin TEXT
    CHECK (origin IS NULL OR (length(origin) BETWEEN 3 AND 300 AND instr(origin, ':') > 1));

CREATE INDEX task_origin ON task (origin) WHERE origin IS NOT NULL;
