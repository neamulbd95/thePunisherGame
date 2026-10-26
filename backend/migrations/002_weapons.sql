-- The weapon is chosen when a game starts and is stored on the server-issued session,
-- so the score replay uses the weapon the player was actually allowed to use.
ALTER TABLE game_sessions
  ADD COLUMN weapon text NOT NULL DEFAULT 'hand'
  CHECK (weapon IN ('hand', 'sandal', 'broom', 'bamboo', 'belan', 'pan'));
