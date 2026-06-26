-- Multi-user identity + per-user Spotify token + sync state.
-- A `users` table already exists in some envs (id, display_name, access_token, refresh_token,
-- token_expiry, created_at). This migration is safe BOTH on a fresh DB and on that existing table:
-- create-if-missing, then add each new column if-not-exists. NON-DESTRUCTIVE — never drops or
-- rewrites existing columns or rows. The legacy access_token/refresh_token columns are left as-is;
-- new code stores the full spotipy token in token_info (JSON).
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_info   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_status  TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_detail  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS saved_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sync    TIMESTAMPTZ;

-- Accounts that already have a synced library are 'ready' with their real saved count.
UPDATE users u SET
    sync_status = 'ready',
    saved_count = (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id),
    last_sync   = COALESCE(u.last_sync, now())
WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id);
