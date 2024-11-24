-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_journals_user_id ON journals(user_id);
CREATE INDEX IF NOT EXISTS idx_quests_user_id ON quests(user_id);

-- Add proper timestamps to all tables if missing
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Ensure proper foreign key constraints
ALTER TABLE journals
  DROP CONSTRAINT IF EXISTS journals_user_id_fkey,
  ADD CONSTRAINT journals_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

ALTER TABLE quests
  DROP CONSTRAINT IF EXISTS quests_user_id_fkey,
  ADD CONSTRAINT quests_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;
