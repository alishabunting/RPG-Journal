import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import pgSimple from "connect-pg-simple";
import cors from "cors";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import "./auth.js";
import { db, checkConnection, getPoolStatus, pool, startHealthCheck, stopHealthCheck } from "../db/index.js";

// Enhanced port configuration for Replit compatibility
const PORT = parseInt(process.env.PORT || "3000", 10);
const isReplit = !!process.env.REPL_SLUG;
const isDev = process.env.NODE_ENV !== "production";

console.log("=== Starting Server Initialization ===");
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT,
  IS_REPLIT: isReplit,
  REPL_SLUG: process.env.REPL_SLUG,
  REPL_OWNER: process.env.REPL_OWNER,
});

// Initialize Express app with error handling
const app = express();
let server: any = null;
let isShuttingDown = false;

// Basic middleware setup with increased limits and optimized parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Enhanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    res.status(503).send('Server is shutting down');
    return;
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] ${req.method} ${req.url} - Started`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// Enhanced error handler with Replit-specific logging
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', {
    error: err.message,
    stack: isDev ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    environment: isReplit ? 'replit' : 'local'
  });

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: isDev ? err.message : 'An unexpected error occurred'
    });
  }
});

// Optimized CORS configuration for Replit
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Enhanced origin handling for Replit
    const replitOrigin = isReplit ? [
      `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
      `https://${process.env.REPL_ID}.id.repl.co`
    ] : [];

    const allowedOrigins = [
      ...replitOrigin,
      `http://localhost:${PORT}`,
      `http://0.0.0.0:${PORT}`,
      undefined
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`, {
        allowedOrigins,
        isReplit,
        environment: process.env.NODE_ENV
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Enhanced health check endpoint with detailed diagnostics
app.get('/health', async (req: Request, res: Response) => {
  try {
    if (isShuttingDown) {
      res.status(503).json({
        status: 'shutting_down',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const dbStatus = await getPoolStatus();
    const memoryUsage = process.memoryUsage();
    
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      server: {
        port: PORT,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        is_replit: isReplit,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          unit: 'MB'
        }
      },
      database: dbStatus
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Enhanced database initialization with better error handling
async function initializeDatabase() {
  console.log("Initializing database connection...");
  let retries = 5;
  let delay = 1000;
  
  while (retries > 0) {
    try {
      await checkConnection();
      const status = await getPoolStatus();
      console.log("Database connection successful:", status.poolStats);
      return true;
    } catch (error) {
      retries--;
      console.error(`Database connection attempt failed (${retries} attempts left):`, error);
      
      if (retries === 0) {
        console.error("Database connection failed after all retries");
        return false;
      }
      
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
  return false;
}

// Enhanced session initialization with Replit optimizations
async function initializeSession() {
  console.log("Initializing session management...");
  const PgSession = pgSimple(session);
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    
    const sessionStore = new PgSession({
      pool,
      tableName: 'session',
      pruneSessionInterval: 60
    });

    // Configure session middleware with Replit-specific settings
    app.use(session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || process.env.REPL_ID || "rpg-journal-secret",
      resave: false,
      saveUninitialized: false,
      name: 'rpg.session',
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: isReplit || process.env.NODE_ENV === 'production',
        sameSite: isReplit ? 'none' : 'lax',
        domain: isReplit ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : undefined
      }
    }));

    app.use(passport.initialize());
    app.use(passport.session());
    
    console.log("Session management initialized successfully");
    return true;
  } catch (error) {
    console.error("Session initialization failed:", error);
    return false;
  }
}

// Improved server startup sequence with Replit optimizations
async function startServer() {
  try {
    console.log("Starting server initialization...");
    
    if (!await initializeDatabase()) {
      throw new Error("Database initialization failed");
    }

    if (!await initializeSession()) {
      throw new Error("Session initialization failed");
    }

    console.log("Registering routes...");
    registerRoutes(app);

    return new Promise((resolve, reject) => {
      const startTimeout = setTimeout(() => {
        console.error("Server startup timed out");
        reject(new Error("Server failed to start within 30 seconds"));
      }, 30000);

      try {
        // Create server instance
        server = createServer(app);

        // Set up error handling before starting
        server.on('error', (error: Error) => {
          clearTimeout(startTimeout);
          console.error('Server error:', error);
          reject(error);
        });

        // Set up Vite or static serving after server creation
        if (isDev) {
          console.log("Setting up Vite development server...");
          setupVite(app, server)
            .then(() => {
              // Start server after Vite is set up
              server.listen(PORT, "0.0.0.0", () => {
                clearTimeout(startTimeout);
                console.log(`Server running on port ${PORT}`);
                if (isReplit) {
                  console.log(`Available at: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
                }
                resolve(server);
              });
            })
            .catch(reject);
        } else {
          console.log("Setting up static file serving...");
          serveStatic(app);
          
          // Start server for production
          server.listen(PORT, "0.0.0.0", () => {
            clearTimeout(startTimeout);
            console.log(`Server running on port ${PORT}`);
            if (isReplit) {
              console.log(`Available at: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
            }
            resolve(server);
          });
        }
      } catch (error) {
        clearTimeout(startTimeout);
        console.error('Failed to start server:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error("Fatal server error:", error);
    throw error;
  }
}

// Start the server with enhanced error handling
console.log("Initiating server startup sequence...");
let startupComplete = false;

startServer()
  .then(() => {
    console.log("Server started successfully");
    startupComplete = true;
    startHealthCheck();
  })
  .catch((error) => {
    console.error("Server failed to start:", error);
    process.exit(1);
  });

// Enhanced cleanup function with proper shutdown coordination
const cleanup = async () => {
  if (isShuttingDown) {
    console.log("Cleanup already in progress");
    return;
  }

  if (!startupComplete) {
    console.log("Ignoring cleanup during startup/restart");
    return;
  }

  isShuttingDown = true;
  console.log("Starting graceful shutdown...");
  stopHealthCheck();

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise<void>((resolve) => {
        const forceShutdownTimeout = setTimeout(() => {
          console.log("Force shutdown initiated");
          resolve();
        }, 5000);

        server.close(() => {
          clearTimeout(forceShutdownTimeout);
          console.log("Server closed successfully");
          resolve();
        });
      });
    }

    // Wait for existing connections to complete (up to 5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close database connections
    if (pool) {
      try {
        await pool.end();
        console.log("Database connections closed");
      } catch (error) {
        if (error instanceof Error && error.message !== 'Called end on pool more than once') {
          console.error("Error closing database connections:", error);
        }
      }
    }

    console.log("Shutdown completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
};

// Register cleanup handlers with debouncing
let cleanupTimeout: NodeJS.Timeout | null = null;
const debouncedCleanup = () => {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
  }
  cleanupTimeout = setTimeout(cleanup, 100);
};

process.on('SIGTERM', debouncedCleanup);
process.on('SIGINT', debouncedCleanup);

// Enhanced error handlers with proper logging
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    environment: isReplit ? 'replit' : 'local'
  });
  debouncedCleanup();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", {
    reason,
    timestamp: new Date().toISOString(),
    environment: isReplit ? 'replit' : 'local'
  });
  debouncedCleanup();
});
