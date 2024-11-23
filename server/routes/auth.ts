import type { Router } from "express";
import passport from "passport";
import type { User } from "../../db/schema.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { ensureAuthenticated } from "../auth.js";

import type { Request, Response } from "express";

export function registerAuthRoutes(router: Router) {
  router.post("/auth/login", passport.authenticate("local"), (req: Request, res: Response) => {
    console.log(`Login successful for user: ${(req.user as User).username}`);
    res.json(req.user);
  });

  router.get("/auth/me", ensureAuthenticated, async (req: Request, res: Response) => {
    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, (req.user as User).id))
      .limit(1);
    res.json(user);
  });

  router.post("/auth/logout", (req: Request, res: Response) => {
    const username = (req.user as User)?.username;
    req.logout((err: any) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      console.log(`User logged out successfully: ${username}`);
      res.sendStatus(200);
    });
  });
}
