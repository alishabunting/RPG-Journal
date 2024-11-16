import type { Express } from "express";
import passport from "passport";
import { db } from "../db";
import { users, journals, quests } from "../db/schema";
import { eq } from "drizzle-orm";
import { analyzeEntry, generateQuests } from "./openai";
import { ensureAuthenticated } from "./auth";

export function registerRoutes(app: Express) {
  // Auth routes
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  app.get("/api/auth/me", ensureAuthenticated, (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.sendStatus(200);
    });
  });

  // Character routes
  app.put("/api/character", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    await db
      .update(users)
      .set({ character: req.body })
      .where(eq(users.id, userId));
    res.sendStatus(200);
  });

  // Journal routes
  app.get("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    const userJournals = await db.query.journals.findMany({
      where: eq(journals.userId, userId),
      orderBy: (journals, { desc }) => [desc(journals.createdAt)],
    });
    res.json(userJournals);
  });

  app.post("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    const { content } = req.body;

    // Analyze entry with OpenAI
    const analysis = await analyzeEntry(content);
    
    // Create journal entry
    await db.insert(journals).values({
      userId,
      content,
      mood: analysis.mood,
      tags: analysis.tags,
    });

    // Generate and save quests
    const newQuests = await generateQuests(analysis);
    await db.insert(quests).values(
      newQuests.map(quest => ({
        userId,
        ...quest,
      }))
    );

    res.sendStatus(201);
  });

  // Quest routes
  app.get("/api/quests", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    const userQuests = await db.query.quests.findMany({
      where: eq(quests.userId, userId),
      orderBy: (quests, { desc }) => [desc(quests.createdAt)],
    });
    res.json(userQuests);
  });

  app.post("/api/quests/:id/complete", ensureAuthenticated, async (req, res) => {
    const questId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    
    await db
      .update(quests)
      .set({ 
        status: "completed",
        completedAt: new Date()
      })
      .where(eq(quests.id, questId))
      .where(eq(quests.userId, userId));
    
    res.sendStatus(200);
  });

  // Registration route
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    
    try {
      const hashedPassword = await hash(password, 10);
      await db.insert(users).values({
        username,
        password: hashedPassword,
      });
      res.sendStatus(201);
    } catch (error) {
      if ((error as any).code === '23505') { // Unique violation
        res.status(400).json({ message: "Username already exists" });
      } else {
        res.status(500).json({ message: "Error creating user" });
      }
    }
  });
}
