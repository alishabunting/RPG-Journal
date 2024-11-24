import { pgTable, text, integer, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull(),
  character: jsonb("character").default({
    name: "",
    avatar: "",
    class: "",
    level: 1,
    xp: 0,
    stats: {
      wellness: 1,
      social: 1,
      growth: 1,
      achievement: 1
    },
    achievements: []
  }).notNull()
});

export const journals = pgTable("journals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  mood: text("mood").notNull(),
  tags: text("tags").array(),
  analysis: jsonb("analysis"),
  characterProgression: jsonb("character_progression"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type QuestTable = typeof quests;

export const quests = pgTable("quests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  difficulty: integer("difficulty").notNull(),
  xpReward: integer("xp_reward").notNull(),
  statRequirements: jsonb("stat_requirements").$type<Record<string, number>>(),
  statRewards: jsonb("stat_rewards").$type<Record<string, number>>(),
  timeframe: text("timeframe"),
  status: text("status").default("active").notNull(),
  storylineId: text("storyline_id"),
  previousQuestId: integer("previous_quest_id"),
  nextQuestId: integer("next_quest_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at")
});

export type QuestWithRelations = typeof quests.$inferSelect & {
  previousQuest?: QuestWithRelations;
  nextQuest?: QuestWithRelations;
};

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertJournalSchema = createInsertSchema(journals);
export const selectJournalSchema = createSelectSchema(journals);
export const insertQuestSchema = createInsertSchema(quests);
export const selectQuestSchema = createSelectSchema(quests);

export type User = z.infer<typeof selectUserSchema>;
export type Journal = z.infer<typeof selectJournalSchema>;
export type Quest = z.infer<typeof selectQuestSchema>;
