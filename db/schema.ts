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

export const quests = pgTable("quests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  difficulty: integer("difficulty").notNull(),
  xpReward: integer("xp_reward").notNull(),
  statRewards: jsonb("stat_rewards"),
  timeframe: text("timeframe"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at")
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertJournalSchema = createInsertSchema(journals);
export const selectJournalSchema = createSelectSchema(journals);
export const insertQuestSchema = createInsertSchema(quests);
export const selectQuestSchema = createSelectSchema(quests);

export type User = z.infer<typeof selectUserSchema>;
export type Journal = z.infer<typeof selectJournalSchema>;
export type Quest = z.infer<typeof selectQuestSchema>;
