import type { Router } from "express";
import { pool } from "../../db/index.js";
import { ensureAuthenticated } from "../auth.js";
import type { User } from "../../db/schema.js";
import { processJournalEntry } from "../utils/journalProcessor.js";
import { getEmotionalIntensity } from "../utils/emotionProcessor.js";
import { XP_CONFIG } from "../utils/progression.js";

import type { Request, Response } from "express";

export function registerCharacterRoutes(router: Router) {
  router.put("/character", ensureAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as User).id;
    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      const result = await processJournalEntry(userId, req.body.content, client);
      
      const emotionalIntensity = getEmotionalIntensity(result.journal.mood || 'neutral');
      result.character.stats = Object.fromEntries(
        Object.entries(result.character.stats).map(([stat, value]) => [
          stat,
          Math.min(XP_CONFIG.MAX_STAT_VALUE, 
            Number(value) + (Number(result.character.statChanges?.[stat] || 0)) * emotionalIntensity
          )
        ])
      );
      
      await client.query('COMMIT');
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Error processing character update:', error);
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
