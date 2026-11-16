-- Reflections (spec 2026-11-16, Reviews). Syncable (ADR-012): every write logs change_log with
-- entity 'reflection'. One row per shutdown day (`shutdown:<day>`) or planned week
-- (`week:<monday>`), so two devices agree on the id. The CHECKs tie the shutdown fields to
-- kind 'shutdown' and the week fields to kind 'week'; counts and distinct ids of priorities are
-- the service's. A removed row is a tombstone (deleted_at).
CREATE TABLE reflection (
    id              TEXT    PRIMARY KEY,
    kind            TEXT    NOT NULL CHECK (kind IN ('shutdown', 'week')),
    period          TEXT    NOT NULL
        CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    went_well       TEXT    CHECK (length(went_well) <= 1000),
    to_improve      TEXT    CHECK (length(to_improve) <= 1000),
    outside_control TEXT    CHECK (length(outside_control) <= 1000),
    improvement     TEXT    CHECK (length(improvement) <= 200),
    notes           TEXT    CHECK (length(notes) <= 2000),
    priorities      TEXT    NOT NULL DEFAULT '[]'
        CHECK (CASE WHEN json_valid(priorities) THEN json_type(priorities) = 'array' ELSE 0 END),
    completed_at    INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER,
    CHECK (id = kind || ':' || period),
    CHECK (kind = 'shutdown'
        OR (went_well IS NULL AND to_improve IS NULL AND outside_control IS NULL)),
    CHECK (kind = 'week'
        OR (improvement IS NULL AND notes IS NULL AND priorities = '[]'))
);

CREATE UNIQUE INDEX reflection_kind_period ON reflection (kind, period);
