CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar_url TEXT,
 google_sub TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS driving_sessions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(end_at > start_at)
);
CREATE INDEX IF NOT EXISTS driving_sessions_user_start ON driving_sessions(user_id,start_at);
CREATE TABLE IF NOT EXISTS trips (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ NOT NULL, service TEXT NOT NULL DEFAULT 'GrabCar',
 pickup TEXT NOT NULL DEFAULT '', dropoff TEXT NOT NULL DEFAULT '', paid_km DOUBLE PRECISION NOT NULL DEFAULT 0,
 deadhead_km DOUBLE PRECISION NOT NULL DEFAULT 0, gross_satang BIGINT NOT NULL DEFAULT 0,
 tip_satang BIGINT NOT NULL DEFAULT 0, toll_satang BIGINT NOT NULL DEFAULT 0,
 platform_fee_satang BIGINT NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT 'credit',
 note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(ended_at >= started_at), CHECK(paid_km >= 0), CHECK(deadhead_km >= 0), CHECK(payment_method IN ('credit','cash'))
);
CREATE INDEX IF NOT EXISTS trips_user_started ON trips(user_id,started_at);
CREATE TABLE IF NOT EXISTS fuel_logs (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filled_at TIMESTAMPTZ NOT NULL, liters DOUBLE PRECISION NOT NULL, total_satang BIGINT NOT NULL,
 odometer_km DOUBLE PRECISION, station TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
 external_id TEXT, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(liters > 0), CHECK(total_satang >= 0), UNIQUE(user_id,source,external_id)
);
CREATE INDEX IF NOT EXISTS fuel_user_date ON fuel_logs(user_id,filled_at);
CREATE TABLE IF NOT EXISTS wallet_entries (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurred_at TIMESTAMPTZ NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL,
 amount_satang BIGINT NOT NULL, note TEXT NOT NULL DEFAULT '', trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(wallet IN ('credit','cash')), CHECK(amount_satang <> 0)
);
CREATE INDEX IF NOT EXISTS wallet_user_date ON wallet_entries(user_id,occurred_at);
CREATE TABLE IF NOT EXISTS operating_costs (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurred_at TIMESTAMPTZ NOT NULL, category TEXT NOT NULL, amount_satang BIGINT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(amount_satang >= 0)
);
CREATE TABLE IF NOT EXISTS ocr_drafts (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'pending',
 image_data BYTEA NOT NULL, image_mime TEXT NOT NULL, raw_text TEXT NOT NULL DEFAULT '',
 parsed_json JSONB NOT NULL DEFAULT '{}'::jsonb, CHECK(status IN ('pending','confirmed','discarded'))
);
CREATE TABLE IF NOT EXISTS settings (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL,
 PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS integration_events (
 id UUID PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL,
 user_id UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source,external_id)
);
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
