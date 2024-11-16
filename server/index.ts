import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import pgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import "./auth";
import { db } from "../db";
import { users } from "../db/schema";

const app = express();

// Logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
const PgSession = pgSimple(session);

console.log("Initializing session store...");
const sessionStore = new PgSession({
  conObject: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  },
  createTableIfMissing: true,
  pruneSessionInterval: 60
});

// Add error handler for session store
sessionStore.on('error', (error) => {
  console.error('Session store error:', error);
});

const sessionSecret = process.env.SESSION_SECRET || process.env.REPLIT_ID || "rpg-journal-secret";

app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production",
      sameSite: 'lax'
    },
  })
);

// Initialize passport
console.log("Initializing passport...");
app.use(passport.initialize());
app.use(passport.session());

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ message: "Internal server error" });
});

(async () => {
  try {
    // Add database connection check
    try {
      await db.query.users.findFirst();
      console.log("Database connection successful");
    } catch (error) {
      console.error("Database connection failed:", error);
      process.exit(1);
    }

    console.log("Registering routes...");
    registerRoutes(app);
    const server = createServer(app);

    // Error handling for uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    if (app.get("env") === "development") {
      console.log("Setting up Vite in development mode...");
      await setupVite(app, server);
    } else {
      console.log("Setting up static file serving...");
      serveStatic(app);
    }

    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      const formattedTime = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      console.log(`${formattedTime} [express] Server started successfully on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
