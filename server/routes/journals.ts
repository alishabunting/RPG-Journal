import type { Express } from "express";
import { getDb, pool } from "../../db/index.js";
import { users, journals, quests } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { User } from "../../db/schema.js";
import { drizzle } from "drizzle-orm/neon-serverless";
import { ensureAuthenticated } from "../auth.js";
import { processJournalEntry } from "../utils/journalProcessor.js";

export function registerJournalRoutes(app: Express) {
  // Journal entry endpoint with character progression
  app.post("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    const { content } = req.body;
    
    if (!content?.trim()) {
      res.status(400).json({ message: "Content is required" });
      return;
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      const result = await processJournalEntry(userId, content, client);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Error processing journal entry:', error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
}
