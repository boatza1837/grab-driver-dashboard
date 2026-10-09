ALTER TABLE trips ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS trips_user_source_external ON trips(user_id,source,external_id);

ALTER TABLE driving_sessions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE driving_sessions ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS driving_sessions_user_source_external ON driving_sessions(user_id,source,external_id);
