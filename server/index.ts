import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import pgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import "./auth";
import { db, checkConnection, getPoolStatus, pool, startHealthCheck, stopHealthCheck } from "../db";

const app = express();

// Enhanced logging middleware with request tracking
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`${new Date().toISOString()} [${requestId}] [${req.method}] ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration with enhanced options
const PgSession = pgSimple(session);

console.log("Initializing session store...");
const sessionStore = new PgSession({
  pool,
  createTableIfMissing: true,
  tableName: 'session',
  schemaName: 'public',
  pruneSessionInterval: 60, // Prune expired sessions every 60 seconds
  disableTouch: false, // Enable session touches to prevent premature expiration
  // Enhanced error handling for session store
  errorLog: (error) => {
    console.error('Session store error:', error);
  }
});

// Session store error handling
sessionStore.on('error', (error) => {
  console.error('Session store error:', error);
});

const sessionSecret = process.env.SESSION_SECRET || process.env.REPLIT_ID || "rpg-journal-secret";

// Enhanced session configuration
app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    name: 'rpg.sid', // Custom cookie name
    resave: false,
    rolling: true, // Reset maxAge on every response
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    },
    // Enable session store keep-alive
    unset: 'keep'
  })
);

// Initialize passport
console.log("Initializing passport...");
app.use(passport.initialize());
app.use(passport.session());

// Enhanced pool status monitoring endpoint
app.get('/api/health/pool', async (_req: Request, res: Response) => {
  try {
    const status = await getPoolStatus();
    res.json(status);
  } catch (error) {
    console.error('Failed to get pool status:', error);
    res.status(500).json({ error: 'Failed to get pool status' });
  }
});

// Health check endpoint with enhanced metrics
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const poolStatus = await getPoolStatus();
    const sessionCount = await getSessionCount();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      pool: poolStatus,
      sessions: {
        count: sessionCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Session count helper function with retry logic
async function getSessionCount() {
  let retries = 3;
  while (retries > 0) {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM session');
      return parseInt(result.rows[0].count);
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error('Failed to get session count after all retries:', error);
        return -1;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return -1;
}

// Enhanced error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    message: "Internal server error",
    code: err.name,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Session cleanup on shutdown with retry logic
async function cleanupSessions() {
  let retries = 3;
  while (retries > 0) {
    try {
      await pool.query('DELETE FROM session WHERE expire < NOW()');
      console.log('Expired sessions cleaned up');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error('Failed to cleanup sessions after all retries:', error);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

(async () => {
  try {
    console.log("Checking database connection...");
    await checkConnection();

    // Clean up expired sessions on startup
    await cleanupSessions();

    console.log("Registering routes...");
    registerRoutes(app);
    const server = createServer(app);

    // Error handling for uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      stopHealthCheck(); // Stop health check on uncaught exception
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
      startHealthCheck(); // Start health check after server starts
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Cleaning up...');
  stopHealthCheck();
  await cleanupSessions();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Cleaning up...');
  stopHealthCheck();
  await cleanupSessions();
  process.exit(0);
});
