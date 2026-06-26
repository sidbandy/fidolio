-- Multi-user: dedupe plays per USER, not globally. The old UNIQUE(played_at) meant two users
-- listening at the same instant would collide (one play dropped). Scope it to (user_id, played_at).
-- Safe: single-user data is already unique on (user_id, played_at). Idempotent.
ALTER TABLE listening_history DROP CONSTRAINT IF EXISTS listening_history_played_at_key;
ALTER TABLE listening_history DROP CONSTRAINT IF EXISTS listening_history_user_played_at_key;
ALTER TABLE listening_history ADD CONSTRAINT listening_history_user_played_at_key UNIQUE (user_id, played_at);
