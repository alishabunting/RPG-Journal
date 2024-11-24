import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import pgSimple from "connect-pg-simple";
import cors from "cors";
import type { Pool as PgPool } from 'pg';
import "dotenv/config";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic } from "./vite.js";
import { createServer } from "http";
import "./auth.js";
import { checkConnection, getPoolStatus, pool, startHealthCheck, stopHealthCheck, getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

// Enhanced port configuration for Replit with external port mapping
const API_PORT = 3000;  // API server port
const CLIENT_PORT = 5173; // Vite client port
const EXTERNAL_PORT = Number(process.env.EXTERNAL_PORT) || 80;
const HOST = '0.0.0.0';  // Always bind to all interfaces
const isReplit = process.env.REPL_ID !== undefined;

// Set environment variables for consistency
process.env.PORT = API_PORT.toString();
process.env.HOST = HOST;
const isDev = process.env.NODE_ENV !== "production";
let startupComplete = false;

// Database configuration validation
function validateDatabaseConfig() {
  const requiredEnvVars = ['DATABASE_URL', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGHOST', 'PGPORT'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variables: ${missing.join(', ')}`
    );
  }
  
  // Validate DATABASE_URL format
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('postgres://') && !url?.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }
}

// Initialize empty environment variables with defaults if not set
process.env.PORT = process.env.PORT || '5000';
process.env.HOST = process.env.HOST || '0.0.0.0';

console.log("=== Starting Server Initialization on Replit ===");
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  API_PORT,
  EXTERNAL_PORT,
  HOST,
  IS_REPLIT: isReplit,
  REPL_SLUG: process.env.REPL_SLUG,
  REPL_OWNER: process.env.REPL_OWNER,
  SERVER_URL: isReplit ? `https://${process.env.REPL_SLUG}--${EXTERNAL_PORT}.${process.env.REPL_OWNER}.repl.co` : `http://${HOST}:${API_PORT}`
});

// Initialize Express app with Replit-optimized error handling
const app = express();
let server: ReturnType<typeof createServer> | null = null;
let isShuttingDown = false;
let serverStarted = false;

// Enable better error handling for async errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Replit-optimized middleware setup with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Trust proxy for Replit environment
app.set('trust proxy', isReplit ? 1 : 0);

// Enhanced request logging middleware for Replit with timing
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    res.status(503).send('Server is in maintenance mode');
    return;
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] ${req.method} ${req.url} - Started on Replit`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms on Replit`);
  });
  
  next();
});

// Optimized CORS configuration for Replit
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
      `https://${process.env.REPL_ID}.id.repl.co`,
      `https://${process.env.REPL_SLUG}--${API_PORT}.${process.env.REPL_OWNER}.repl.co`,
      `https://${process.env.REPL_SLUG}-${API_PORT}.${process.env.REPL_OWNER}.repl.co`,
      `http://${HOST}:${API_PORT}`,
      `http://localhost:${API_PORT}`,
      `ws://${HOST}:${API_PORT}`,
      `wss://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
      undefined // Allow requests with no origin (like mobile apps or curl requests)
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`, {
        allowedOrigins,
        isReplit,
        environment: process.env.NODE_ENV
      });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Enhanced health check endpoint with Replit diagnostics
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
        port: API_PORT,
        host: HOST,
        uptime: process.uptime(),
        environment: 'replit',
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
    console.error('Health check failed on Replit:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Replit-optimized database initialization with better retry logic
async function initializeDatabase() {
  console.log("Initializing database connection on Replit...");
  let retries = 5;
  let delay = 1000;
  let lastError = null;
  
  while (retries > 0) {
    try {
      // Validate database config first
      validateDatabaseConfig();
      
      // Test connection
      await checkConnection();
      const db = await getDb();
      
      // Verify schema and connection
      interface DbInfo extends Record<string, unknown> {
        version: string;
        current_db: string;
        current_user: string;
      }
      
      const { rows } = await db.execute<DbInfo>(sql`
        SELECT version() as version,
               current_database() as current_db,
               current_user as current_user
      `);
      
      if (!rows || rows.length === 0) {
        throw new Error('Failed to get database information');
      }
      
      const status = await getPoolStatus();
      console.log("Database connection successful:", {
        ...status.poolStats,
        database: rows[0].current_db,
        version: rows[0].version?.split(' ')[0] || 'unknown'
      });

      // Start health monitoring
      startHealthCheck();
      
      return true;
    } catch (error) {
      lastError = error;
      retries--;
      console.error(`Database initialization attempt failed (${retries} attempts left):`, error);
      
      if (retries === 0) {
        console.error("Database initialization failed after all retries:", lastError);
        throw lastError;
      }
      
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
  
  throw lastError || new Error("Database initialization failed");
}

// Replit-optimized session initialization with better error handling
async function initializeSession() {
  console.log("Initializing session management on Replit...");
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
      pool: pool as unknown as PgPool,
      tableName: 'session',
      pruneSessionInterval: 60
    });

    app.use(session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || process.env.REPL_ID || "rpg-journal-secret",
      resave: false,
      saveUninitialized: false,
      name: 'rpg.session',
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: isReplit,
        sameSite: isReplit ? 'none' : 'lax',
        domain: isReplit ? `.${process.env.REPL_OWNER}.repl.co` : undefined
      }
    }));

    app.use(passport.initialize());
    app.use(passport.session());
    
    console.log("Session management initialized successfully on Replit");
    return true;
  } catch (error) {
    console.error("Session initialization failed on Replit:", error);
    return false;
  }
}

// Replit-optimized server startup sequence with better synchronization
async function startServer() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Verify database connection string
  const dbUrl = new URL(process.env.DATABASE_URL);
  if (!dbUrl.protocol.startsWith('postgres')) {
    throw new Error('Invalid database URL protocol');
  }

  console.log("Starting server initialization...");
  
  try {
    // Initialize database first
    await initializeDatabase();
    console.log("Database initialized successfully");
    startHealthCheck();

    // Initialize session with retries
    let sessionInitialized = false;
    for (let i = 0; i < 3; i++) {
      try {
        sessionInitialized = await initializeSession();
        if (sessionInitialized) break;
      } catch (error) {
        console.error(`Session initialization attempt ${i + 1} failed:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!sessionInitialized) {
      throw new Error("Session initialization failed after multiple attempts");
    }

    console.log("Registering routes on Replit...");
    registerRoutes(app);

    return new Promise((resolve, reject) => {
      const startTimeout = setTimeout(() => {
        console.error("Server startup timed out on Replit");
        reject(new Error("Server failed to start within 15 seconds"));
      }, 15000);

      try {
        server = createServer(app);

        server.on('error', (error: Error) => {
          clearTimeout(startTimeout);
          console.error('Server error on Replit:', error);
          reject(error);
        });

        // Start server with retries
        const startServerWithRetry = (retryCount = 0) => {
          if (!server) {
            throw new Error('Server not initialized');
          }
          
          const serverInstance = server;
          serverInstance.listen(API_PORT, HOST, async () => {
            clearTimeout(startTimeout);
            console.log(`Server running on Replit at ${HOST}:${API_PORT}`);
            startupComplete = true;
            
            if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
              console.log(`Available at: https://${process.env.REPL_SLUG}--${EXTERNAL_PORT}.${process.env.REPL_OWNER}.repl.co`);
            }

            // Development server setup
            if (isDev && server) {
              try {
                console.log("Setting up Vite development server on Replit...");
                await setupVite(app, server);
                console.log("Vite development server setup complete");
              } catch (error) {
                console.error("Vite setup failed:", error);
              }
            } else {
              console.log("Setting up static file serving on Replit...");
              serveStatic(app);
            }
            
            resolve(server);
          }).on('error', (err: any) => {
            if (err.code === 'EADDRINUSE' && retryCount < 3) {
              console.log(`Port ${API_PORT} in use, retrying in 1s...`);
              setTimeout(() => {
                if (server) {
                  server.close();
                }
                startServerWithRetry(retryCount + 1);
              }, 1000);
            } else {
              clearTimeout(startTimeout);
              reject(err);
            }
          });
        };

        startServerWithRetry();
      } catch (error) {
        clearTimeout(startTimeout);
        console.error('Failed to start server on Replit:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error("Fatal server error on Replit:", error);
    throw error;
  }
}

// Enhanced cleanup handlers
async function cleanup() {
  if (isShuttingDown) {
    console.log("Cleanup already in progress on Replit");
    return;
  }

  if (!startupComplete) {
    console.log("Ignoring cleanup during startup/restart on Replit");
    return;
  }

  isShuttingDown = true;
  console.log("Starting graceful shutdown on Replit...");
  stopHealthCheck();

  try {
    if (server) {
      await new Promise<void>((resolve) => {
        const forceShutdownTimeout = setTimeout(() => {
          console.log("Force shutdown initiated on Replit");
          resolve();
        }, 3000);

        if (server) {
          server.close(() => {
            clearTimeout(forceShutdownTimeout);
            console.log("Server closed successfully on Replit");
            resolve();
          });
        } else {
          clearTimeout(forceShutdownTimeout);
          console.log("No server instance to close");
          resolve();
        }
      });
    }

    if (pool) {
      try {
        await pool.end();
        console.log("Database connections closed on Replit");
      } catch (error) {
        if (error instanceof Error && error.message !== 'Called end on pool more than once') {
          console.error("Error closing database connections on Replit:", error);
        }
      }
    }

    console.log("Shutdown completed successfully on Replit");
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup on Replit:", error);
    process.exit(1);
  }
}

// Register cleanup handlers with improved debouncing
let cleanupTimeout: NodeJS.Timeout | null = null;
const debouncedCleanup = () => {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
  }
  cleanupTimeout = setTimeout(cleanup, 100);
};

process.on('SIGTERM', debouncedCleanup);
process.on('SIGINT', debouncedCleanup);

// Enhanced error handlers with Replit-specific logging
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception on Replit:", {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    environment: 'replit'
  });
  debouncedCleanup();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection on Replit:", {
    reason,
    timestamp: new Date().toISOString(),
    environment: 'replit'
  });
  debouncedCleanup();
});