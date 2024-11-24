-- Create the session table if it doesn't exist (needed for authentication)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Update quest table constraints
ALTER TABLE quests
DROP CONSTRAINT IF EXISTS quests_previous_quest_id_fkey,
DROP CONSTRAINT IF EXISTS quests_next_quest_id_fkey;

ALTER TABLE quests
ADD CONSTRAINT quests_previous_quest_id_fkey 
  FOREIGN KEY (previous_quest_id) 
  REFERENCES quests(id) 
  ON DELETE SET NULL,
ADD CONSTRAINT quests_next_quest_id_fkey 
  FOREIGN KEY (next_quest_id) 
  REFERENCES quests(id) 
  ON DELETE SET NULL;
