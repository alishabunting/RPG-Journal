import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

passport.use(
  new LocalStrategy({ passwordField: 'none' }, async (username, _password, done) => {
    try {
      let user = await db.query.users.findFirst({
        where: eq(users.username, username),
      });
      
      if (!user) {
        // If user doesn't exist, create a new one
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
        user = newUser;
        console.log(`New user created: ${username}`);
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
