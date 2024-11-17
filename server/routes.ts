import type { Express } from "express";
import passport from "passport";
import { db } from "../db";
import { users, journals, quests } from "../db/schema";
import { eq } from "drizzle-orm";
import { analyzeEntry, generateQuests } from "./openai";
import { ensureAuthenticated } from "./auth";
import { hash } from "bcrypt";

export function registerRoutes(app: Express) {
  // Auth routes
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    console.log(`Login successful for user: ${(req.user as any).username}`);
    res.json(req.user);
  });

  app.get("/api/auth/me", ensureAuthenticated, (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/logout", (req, res) => {
    const username = (req.user as any)?.username;
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      console.log(`User logged out successfully: ${username}`);
      res.sendStatus(200);
    });
  });

  // Registration is now handled by the LocalStrategy
  app.post("/api/auth/register", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  // Character routes
  app.put("/api/character", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    try {
      await db
        .update(users)
        .set({ character: req.body })
        .where(eq(users.id, userId));
      console.log(`Character updated for user: ${userId}`);
      res.sendStatus(200);
    } catch (error) {
      console.error('Character update error:', error);
      res.status(500).json({ message: "Error updating character" });
    }
  });

  // Journal routes
  app.get("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    try {
      const userJournals = await db.query.journals.findMany({
        where: eq(journals.userId, userId),
        orderBy: (journals, { desc }) => [desc(journals.createdAt)],
      });
      res.json(userJournals);
    } catch (error) {
      console.error('Error fetching journals:', error);
      res.status(500).json({ message: "Error fetching journals" });
    }
  });

  app.post("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    const { content } = req.body;

    try {
      // First analyze the entry
      const analysis = await analyzeEntry(content);
      
      // Save the journal entry first
      const [newJournal] = await db.insert(journals).values({
        userId,
        content,
        mood: analysis.mood,
        tags: analysis.tags,
        analysis: analysis,
        characterProgression: analysis.characterProgression,
      }).returning();

      // After successful journal save, attempt to generate and save quests
      try {
        const newQuests = await generateQuests(analysis);
        if (newQuests && newQuests.length > 0) {
          await db.insert(quests).values(
            newQuests.map(quest => ({
              userId,
              ...quest,
            }))
          );
          console.log(`Generated ${newQuests.length} quests for user: ${userId}`);
        }
      } catch (questError) {
        // Log quest generation error but don't fail the request
        console.error('Error generating/saving quests:', questError);
      }

      console.log(`Journal entry created for user: ${userId}`);
      res.status(201).json(newJournal);
    } catch (error) {
      console.error('Error creating journal entry:', error);
      res.status(500).json({ message: "Error creating journal entry" });
    }
  });

  // Quest routes
  app.get("/api/quests", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    try {
      const userQuests = await db.query.quests.findMany({
        where: eq(quests.userId, userId),
        orderBy: (quests, { desc }) => [desc(quests.createdAt)],
      });
      res.json(userQuests);
    } catch (error) {
      console.error('Error fetching quests:', error);
      res.status(500).json({ message: "Error fetching quests" });
    }
  });

  app.post("/api/quests/:id/complete", ensureAuthenticated, async (req, res) => {
    const questId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    
    try {
      await db
        .update(quests)
        .set({ 
          status: "completed",
          completedAt: new Date()
        })
        .where(eq(quests.id, questId))
        .where(eq(quests.userId, userId));
      
      console.log(`Quest ${questId} completed for user: ${userId}`);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error completing quest:', error);
      res.status(500).json({ message: "Error completing quest" });
    }
  });
}
