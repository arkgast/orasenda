-- Spec B: pre-B databases (those that already have a device_id) owe a one-time notify review.
-- A fresh file gets its device_id after the migrations run, so it gets no marker.
INSERT INTO meta (key, value) SELECT 'notify_review', 'pending' WHERE EXISTS (SELECT 1 FROM meta WHERE key = 'device_id');
