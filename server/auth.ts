import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { compare, hash } from "bcrypt";

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.username, username),
      });
      
      if (!user) {
        console.error(`Authentication failed: User not found - ${username}`);
        return done(null, false, { message: "Invalid username or password" });
      }

      const isValid = await compare(password, user.password);
      console.log(`Password validation for ${username}: ${isValid}`);
      
      if (!isValid) {
        console.error(`Authentication failed: Invalid password for user - ${username}`);
        return done(null, false, { message: "Invalid username or password" });
      }

      console.log(`Authentication successful for user: ${username}`);
      return done(null, user);
    } catch (err) {
      console.error('Authentication error:', err);
      return done(err);
    }
  })
);

passport.serializeUser((user: any, done) => {
  try {
    console.log(`Serializing user: ${user.id}`);
    done(null, user.id);
  } catch (err) {
    console.error('Error during user serialization:', err);
    done(err);
  }
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!user) {
      console.warn(`Session invalid: User ${id} not found during deserialization`);
      return done(null, false);
    }
    console.log(`Deserialized user: ${id}`);
    done(null, user);
  } catch (err) {
    console.error('Error during user deserialization:', err);
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
