ALTER TABLE quests
ADD COLUMN IF NOT EXISTS stat_requirements jsonb,
ADD COLUMN IF NOT EXISTS storyline_id text,
ADD COLUMN IF NOT EXISTS previous_quest_id integer REFERENCES quests(id),
ADD COLUMN IF NOT EXISTS next_quest_id integer REFERENCES quests(id),
ADD COLUMN IF NOT EXISTS metadata jsonb;
