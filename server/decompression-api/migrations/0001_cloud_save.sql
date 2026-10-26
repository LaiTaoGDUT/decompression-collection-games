CREATE TABLE IF NOT EXISTS cloud_saves (
    user_id char(64) PRIMARY KEY,
    modules jsonb NOT NULL DEFAULT '{}'::jsonb,
    achievements text NOT NULL DEFAULT 'AQ==',
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_devices (
    user_id char(64) NOT NULL REFERENCES cloud_saves(user_id),
    device_id char(32) NOT NULL,
    last_seq bigint NOT NULL DEFAULT 0,
    last_hash char(64),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device_id)
);
CREATE TABLE IF NOT EXISTS game_playtime (
    user_id char(64) NOT NULL,
    device_id char(32) NOT NULL,
    game_id text NOT NULL,
    total_ms bigint NOT NULL DEFAULT 0 CHECK (total_ms >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device_id, game_id),
    FOREIGN KEY (user_id, device_id) REFERENCES sync_devices(user_id, device_id)
);
CREATE INDEX IF NOT EXISTS game_playtime_game_idx ON game_playtime(game_id);
