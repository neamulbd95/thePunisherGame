-- Players are now identified by a device cookie plus "nickname#tag", restorable with a recovery code.
-- (Facebook / Google sign-in has been removed. Older rows created through them have no nickname and can no longer sign in;
--  see docs/operations.md for the one-line cleanup.)
ALTER TABLE players
  ADD COLUMN nickname text CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 3 AND 16),
  ADD COLUMN tag smallint CHECK (tag IS NULL OR tag BETWEEN 0 AND 9999),
  ADD COLUMN recovery_hash text;

ALTER TABLE players ADD CONSTRAINT players_nickname_tag_pair CHECK ((nickname IS NULL) = (tag IS NULL));

-- The same nickname can exist many times (case-insensitively) as long as the tags differ.
CREATE UNIQUE INDEX players_nickname_tag_uq ON players (lower(nickname), tag) WHERE nickname IS NOT NULL;
