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
import { testOpenAIConnection } from "./openai.js";

console.log("=== Starting Server Initialization ===");

const app = express();

// Enhanced logging middleware with request tracking
console.log("Setting up middleware...");
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  console.log(`[${requestId}] ${req.method} ${req.url} - Started`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.url} - Completed (${duration}ms) - Status: ${res.statusCode}`);
  });
  
  next();
});

console.log("Configuring CORS...");
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced session store setup with detailed error handling
console.log("Setting up session store...");
const PgSession = pgSimple(session);

function handleSessionError(error: Error): void {
  console.error('Session store error:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
}

const sessionStore = new PgSession({
  pool,
  createTableIfMissing: true,
  tableName: 'session',
  pruneSessionInterval: 60,
  errorLog: handleSessionError
});

sessionStore.on('error', (error: Error) => {
  handleSessionError(error);
  checkConnection().catch(err => {
    console.error('Failed to recover from session store error:', err);
  });
});

const sessionSecret = process.env.SESSION_SECRET || process.env.REPLIT_ID || "rpg-journal-secret";

console.log("Configuring session middleware...");
app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

console.log("Initializing Passport...");
app.use(passport.initialize());
app.use(passport.session());

console.log("Registering routes...");
registerRoutes(app);

// Enhanced error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const errorId = Math.random().toString(36).substring(7);
  console.error('Server error:', {
    errorId,
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({ 
    message: "Internal server error",
    errorId,
    code: err.name
  });
});

async function startServer() {
  try {
    console.log("=== Starting Server ===");
    
    // Check database connection
    console.log("Checking database connection...");
    await checkConnection();
    
    const poolStatus = await getPoolStatus();
    console.log("Database pool status:", poolStatus);

    // Test OpenAI connection
    console.log("Testing OpenAI connection...");
    await testOpenAIConnection();

    console.log("Creating HTTP server...");
    const server = createServer(app);

    if (process.env.NODE_ENV === "development") {
      console.log("Setting up Vite development server...");
      await setupVite(app, server);
    } else {
      console.log("Setting up static file serving...");
      serveStatic(app);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error("Server startup timeout - failed to bind to port");
        reject(new Error("Server startup timeout"));
      }, 30000);

      const PORT = parseInt(process.env.PORT || "5000", 10);

      try {
        server.on('error', (error: any) => {
          clearTimeout(timeoutId);
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use`);
          }
          console.error("Server startup error:", error);
          reject(error);
        });

        server.listen(PORT, "0.0.0.0", () => {
          clearTimeout(timeoutId);
          console.log(`=== Server Successfully Started on Port ${PORT} ===`);
          startHealthCheck();
          resolve(server);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Server listen error:", error);
        reject(error);
      }
    });
  } catch (error) {
    console.error("Fatal server startup error:", error);
    throw error;
  }
}

// Start the server
console.log("Initiating server startup...");
startServer().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log("SIGTERM received, shutting down...");
  stopHealthCheck();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log("SIGINT received, shutting down...");
  stopHealthCheck();
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  stopHealthCheck();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
