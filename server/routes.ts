import type { Express, Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { pool } from "../db/index.js";
import { registerJournalRoutes } from "./routes/journals.js";
import { registerQuestRoutes } from "./routes/quests.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCharacterRoutes } from "./routes/character.js";

interface DatabaseMetrics {
  activeConnections: number;
  timestamp: string;
  latency?: number;
  responseTime?: number;
}

interface PoolStatus {
  poolState: 'active' | 'inactive';
  connections: number;
  metrics: DatabaseMetrics;
}

/**
 * Get database pool status for monitoring
 * @throws {Error} If unable to query database status
 */
async function getPoolStatus(): Promise<PoolStatus> {
  const startTime = Date.now();
  const result = await pool.query('SELECT count(*) as count FROM pg_stat_activity');
  const latency = Date.now() - startTime;

  return {
    poolState: 'active',
    connections: Number(result.rows[0].count) || 0,
    metrics: {
      activeConnections: Number(result.rows[0].count) || 0,
      timestamp: new Date().toISOString(),
      latency
    }
  };
}

// Middleware to track request timing and logging
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  // Attach requestId to the request object for error tracking
  (req as any).requestId = requestId;
  next();
};

// Enhanced error handler middleware with better type safety and context
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = (req as any).requestId;
  const timestamp = new Date().toISOString();

  // Log error with enhanced context
  console.error('Unhandled error:', {
    requestId,
    path: req.path,
    method: req.method,
    message: err.message,
    stack: err.stack,
    status: err.status,
    timestamp
  });
  
  // Send error response with appropriate detail level
  res.status(err.status || 500).json({
    status: 'error',
    requestId,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      path: req.path,
      method: req.method
    })
  });
};

// Route registration with proper error handling
// Register health check routes
function registerHealthRoutes(app: Express) {
  app.get("/api/health", async (_req, res) => {
    let client;
    const startTime = Date.now();
    
    try {
      const dbStatus = await getPoolStatus();
      client = await pool.connect();
      await client.query('SELECT 1');
      
      const responseTime = Date.now() - startTime;
      dbStatus.metrics.responseTime = responseTime;
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connectionState: 'connected',
          poolState: dbStatus.poolState,
          connections: dbStatus.connections,
          metrics: dbStatus.metrics
        }
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('Health check failed:', error);
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          connectionState: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
          metrics: {
            responseTime,
            timestamp: new Date().toISOString()
          }
        }
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
}

// Register core application routes
function registerCoreRoutes(app: Express) {
  // Authentication routes must be registered first
  registerAuthRoutes(app);
  
  // Feature routes in dependency order
  registerQuestRoutes(app);
  registerCharacterRoutes(app);
  registerJournalRoutes(app);
}

// Register error handling routes
function registerErrorRoutes(app: Express) {
  // Global error handling
  app.use(errorHandler);
  
  // 404 handler for unmatched routes (must be last)
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `Route not found: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  });
}

export function registerRoutes(app: Express) {
  // 1. Global middleware for all routes
  app.use(requestLogger);

  // 2. Register routes in proper order
  registerHealthRoutes(app);
  registerCoreRoutes(app);
  registerErrorRoutes(app);
}