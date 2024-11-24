import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

import type { IVerifyOptions, VerifyFunction } from 'passport-local';

passport.use(
  new LocalStrategy({ passwordField: 'none' }, async (username: string, _password: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) => {
    try {
      console.log(`Authentication attempt for username: ${username}`);
      
      const db = await getDb();
      // Always create a new user on login attempt (as per manager's request)
      const [newUser] = await db.insert(users)
        .values({
          username,
          character: {
            name: "",
            avatar: "",
            class: "",
            stats: {
              wellness: 1,
              social: 1,
              growth: 1,
              achievement: 1
            }
          }
        })
        .returning();

      console.log(`New user created with ID: ${newUser.id}`);
      return done(null, newUser);
    } catch (err) {
      console.error('Authentication error:', {
        error: err,
        username: username,
        timestamp: new Date().toISOString()
      });
      return done(err);
    }
  })
);

passport.serializeUser((user: any, done) => {
  try {
    console.log(`Serializing user with ID: ${user.id}`);
    done(null, user.id);
  } catch (err) {
    console.error('Error during user serialization:', {
      error: err,
      userId: user?.id,
      timestamp: new Date().toISOString()
    });
    done(err);
  }
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      console.warn(`Session invalid: User ${id} not found during deserialization`);
      return done(null, false);
    }
    console.log(`Successfully deserialized user: ${id}`);
    done(null, user);
  } catch (err) {
    console.error('Error during user deserialization:', {
      error: err,
      userId: id,
      timestamp: new Date().toISOString()
    });
    done(err);
  }
});

export function ensureAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  console.warn(`Unauthorized access attempt: ${req.originalUrl}`);
  res.status(401).json({ message: "Not authenticated" });
}
