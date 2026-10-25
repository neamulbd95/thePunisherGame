-- Slap the Abuser: initial schema. All timestamps are timestamptz (UTC).

CREATE TABLE players (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_user_id       text UNIQUE,
  display_name           text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_url             text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048),
  friend_code            text NOT NULL UNIQUE CHECK (char_length(friend_code) BETWEEN 6 AND 16),
  fb_friends_granted     boolean NOT NULL DEFAULT false,
  fb_friends_synced_at   timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  last_login_at          timestamptz
);

-- Only a SHA-256 hash of the opaque session token is stored, never the token itself.
CREATE TABLE auth_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_player_idx ON auth_sessions (player_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);

CREATE TABLE game_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  villain              text NOT NULL CHECK (villain IN ('abuser', 'robber', 'rapist')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'rejected')),
  validation_metadata  jsonb,
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX game_sessions_player_idx ON game_sessions (player_id, started_at DESC);

-- game_session_id is UNIQUE: one completed session can produce at most one score row,
-- accepted or rejected, so a rejected submission cannot simply be retried.
CREATE TABLE game_scores (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_session_id    uuid NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  villain            text NOT NULL CHECK (villain IN ('abuser', 'robber', 'rapist')),
  score              integer NOT NULL CHECK (score >= 0),
  rounds             integer NOT NULL DEFAULT 0 CHECK (rounds >= 0),
  perfects           integer NOT NULL DEFAULT 0 CHECK (perfects >= 0),
  duration_ms        integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  validation_status  text NOT NULL CHECK (validation_status IN ('accepted', 'rejected')),
  rejection_reason   text,
  CHECK (validation_status = 'rejected' OR rejection_reason IS NULL)
);
CREATE INDEX game_scores_rank_idx ON game_scores (validation_status, villain, score DESC, submitted_at);
CREATE INDEX game_scores_player_idx ON game_scores (player_id, validation_status);
CREATE INDEX game_scores_submitted_idx ON game_scores (submitted_at);

-- In-game friendships (independent of Facebook permissions).
-- player_id is the requester; the pair is unique regardless of direction.
CREATE TABLE player_friendships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  friend_player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (player_id <> friend_player_id)
);
CREATE UNIQUE INDEX player_friendships_pair_uq
  ON player_friendships (LEAST(player_id, friend_player_id), GREATEST(player_id, friend_player_id));
CREATE INDEX player_friendships_player_idx ON player_friendships (player_id, status);
CREATE INDEX player_friendships_friend_idx ON player_friendships (friend_player_id, status);

-- Short-lived copy of the Facebook ids returned by /me/friends (friends who also use this app).
-- Refreshed at login/sync and treated as stale after a few hours; removed with the player.
CREATE TABLE facebook_friend_cache (
  player_id            uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  friend_facebook_id   text NOT NULL,
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, friend_facebook_id)
);
CREATE INDEX facebook_friend_cache_friend_idx ON facebook_friend_cache (friend_facebook_id);

-- Meta data deletion callback bookkeeping. Holds no personal data.
CREATE TABLE data_deletion_requests (
  confirmation_code  text PRIMARY KEY,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  status             text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'not_found'))
);
