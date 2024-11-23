import type { Express } from "express";
import passport from "passport";
import type { User } from "../../db/schema.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { ensureAuthenticated } from "../auth.js";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    console.log(`Login successful for user: ${(req.user as User).username}`);
    res.json(req.user);
  });

  app.get("/api/auth/me", ensureAuthenticated, async (req, res) => {
    const db = await getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, (req.user as User).id),
    });
    res.json(user);
  });

  app.post("/api/auth/logout", (req, res) => {
    const username = (req.user as User)?.username;
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      console.log(`User logged out successfully: ${username}`);
      res.sendStatus(200);
    });
  });
}
