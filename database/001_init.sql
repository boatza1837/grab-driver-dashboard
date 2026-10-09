PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar_url TEXT,
 google_sub TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS driving_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 start_at TEXT NOT NULL, end_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(end_at > start_at)
);
CREATE INDEX IF NOT EXISTS driving_sessions_user_start ON driving_sessions(user_id,start_at);
CREATE TABLE IF NOT EXISTS trips (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 started_at TEXT NOT NULL, ended_at TEXT NOT NULL, service TEXT NOT NULL DEFAULT 'GrabCar',
 pickup TEXT NOT NULL DEFAULT '', dropoff TEXT NOT NULL DEFAULT '',
 paid_km REAL NOT NULL DEFAULT 0, deadhead_km REAL NOT NULL DEFAULT 0,
 gross_satang NUMERIC NOT NULL DEFAULT 0, tip_satang NUMERIC NOT NULL DEFAULT 0,
 toll_satang NUMERIC NOT NULL DEFAULT 0, platform_fee_satang NUMERIC NOT NULL DEFAULT 0,
 payment_method TEXT NOT NULL DEFAULT 'credit', note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(ended_at >= started_at), CHECK(paid_km >= 0), CHECK(deadhead_km >= 0),
 CHECK(payment_method IN ('credit','cash'))
);
CREATE INDEX IF NOT EXISTS trips_user_started ON trips(user_id,started_at);
CREATE TABLE IF NOT EXISTS fuel_logs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filled_at TEXT NOT NULL, liters REAL NOT NULL, total_satang NUMERIC NOT NULL,
 odometer_km REAL, station TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
 external_id TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(liters > 0), CHECK(total_satang >= 0), UNIQUE(user_id,source,external_id)
);
CREATE INDEX IF NOT EXISTS fuel_user_date ON fuel_logs(user_id,filled_at);
CREATE TABLE IF NOT EXISTS wallet_entries (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurred_at TEXT NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL,
 amount_satang NUMERIC NOT NULL, note TEXT NOT NULL DEFAULT '', trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(wallet IN ('credit','cash')), CHECK(amount_satang != 0)
);
CREATE INDEX IF NOT EXISTS wallet_user_date ON wallet_entries(user_id,occurred_at);
CREATE TABLE IF NOT EXISTS operating_costs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurred_at TEXT NOT NULL, category TEXT NOT NULL, amount_satang NUMERIC NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(amount_satang >= 0)
);
CREATE TABLE IF NOT EXISTS ocr_drafts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'pending',
 image_path TEXT NOT NULL, raw_text TEXT NOT NULL DEFAULT '', parsed_json TEXT NOT NULL DEFAULT '{}',
 CHECK(status IN ('pending','confirmed','discarded'))
);
CREATE TABLE IF NOT EXISTS settings (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL,
 PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS integration_events (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source,external_id)
);
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
