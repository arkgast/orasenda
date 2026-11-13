-- The session intent is gone (H2). Values are cleared and their change_log rows removed so no
-- device ever syncs one. The column stays: SQLite column drops are not worth the risk. The
-- migration writes no change_log rows of its own.
UPDATE focus_session SET intent = NULL WHERE intent IS NOT NULL;
DELETE FROM change_log WHERE entity = 'focus_session' AND field = 'intent';
