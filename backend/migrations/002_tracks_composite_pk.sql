-- Multi-user: a track can belong to MANY users. The old PK (id alone) blocked two users from
-- saving the same song (ON CONFLICT (id) DO NOTHING would skip it for the 2nd user). Switch to a
-- composite PK (user_id, id). Safe: user_id has zero nulls and no FK references tracks(id); existing
-- data is already unique on (user_id, id). Idempotent.
ALTER TABLE tracks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_pkey;
ALTER TABLE tracks ADD CONSTRAINT tracks_pkey PRIMARY KEY (user_id, id);
