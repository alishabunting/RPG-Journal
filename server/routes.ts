import type { Express, Request, Response, NextFunction, ErrorRequestHandler, Router } from "express";
import express from "express";
import { getDb, pool, getPoolStatus } from "../db/index.js";
import type { Pool } from "@neondatabase/serverless";
import { registerJournalRoutes } from "./routes/journals.js";
import { registerQuestRoutes } from "./routes/quests.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCharacterRoutes } from "./routes/character.js";

// Type for route registration functions with proper typing
type RouteRegistrar = (router: Router) => void;

// Interface for typed request with ID
interface RequestWithId extends Request {
  requestId?: string;
}

// Function to create route prefix middleware with proper error handling
function prefixRoutes(prefix: string, router: Router): Router {
  const prefixRouter = express.Router();
  prefixRouter.use(prefix, (err: Error, _req: Request, _res: Response, next: NextFunction) => {
    console.error(`Error in prefixed route ${prefix}:`, err);
    next(err);
  });
  prefixRouter.use(prefix, router);
  return prefixRouter;
}

// Enhanced request logging middleware with proper typing
const requestLogger = (req: RequestWithId, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  req.requestId = Math.random().toString(36).substring(7);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${req.requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// Consolidated error handler middleware with proper typing
const errorHandler: ErrorRequestHandler = (err, req: RequestWithId, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const timestamp = new Date().toISOString();
  const isDev = process.env.NODE_ENV === 'development';

  console.error('Unhandled error:', {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    message: err.message,
    stack: isDev ? err.stack : undefined,
    status: err.status,
    timestamp
  });
  
  res.status(err.status || 500).json({
    status: 'error',
    requestId: req.requestId,
    message: isDev ? err.message : 'Internal server error',
    timestamp,
    ...(isDev && { 
      stack: err.stack,
      path: req.path,
      method: req.method
    })
  });
};

// Route registration with proper error handling
// Consolidated health check routes with proper connection handling
function registerHealthRoutes(app: Express) {
  app.get("/api/health", async (req: RequestWithId, res: Response) => {
    const startTime = Date.now();
    let client;
    
    try {
      const dbStatus = await getPoolStatus();
      client = await pool.connect();
      const queryResult = await client.query('SELECT version(), current_timestamp');
      
      const responseTime = Date.now() - startTime;
      const metrics = {
        ...dbStatus.poolStats,
        responseTime,
        version: queryResult.rows[0].version,
        serverTime: queryResult.rows[0].current_timestamp
      };

      res.json({
        status: 'healthy',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        database: {
          connectionState: 'connected',
          poolState: dbStatus.status,
          metrics,
          lastCheck: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Health check failed:', {
        error,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
      
      res.status(503).json({
        status: 'unhealthy',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connectionState: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
          metrics: {
            responseTime: Date.now() - startTime,
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

// Register error handling routes with improved error handling
function registerErrorRoutes(app: Express) {
  // API error handler
  app.use('/api', (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    res.status(err.status || 500).json({
      status: 'error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      requestId: (req as any).requestId,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handling for non-API routes
  app.use(errorHandler);
  
  // 404 handler for unmatched routes (must be last)
  app.use((req: Request, res: Response) => {
    const message = `Route not found: ${req.method} ${req.path}`;
    console.warn('404 Error:', {
      path: req.path,
      method: req.method,
      requestId: (req as any).requestId
    });

    if (req.path.startsWith('/api')) {
      res.status(404).json({
        status: 'error',
        message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).send(message);
    }
  });
}

// Core routes registration with proper ordering and error handling
function registerCoreRoutes(router: Router) {
  try {
    // Authentication routes must be first to ensure proper session handling
    console.log('Registering auth routes...');
    registerAuthRoutes(router);
    
    // Feature routes in dependency order:
    // 1. Character routes (character data required for other features)
    console.log('Registering character routes...');
    registerCharacterRoutes(router);
    
    // 2. Quest routes (depends on character data)
    console.log('Registering quest routes...');
    // Create a subrouter for quests to handle route-specific middleware
    const questRouter = express.Router();
    registerQuestRoutes(questRouter);
    router.use('/quests', questRouter);
    
    // 3. Journal routes (depends on character and quest data)
    console.log('Registering journal routes...');
    registerJournalRoutes(router);

    console.log('Core routes registered successfully');
  } catch (error) {
    console.error('Error registering core routes:', error);
    throw error;
  }
}

export function registerRoutes(app: Express) {
  console.log('Registering application routes...');
  
  // 1. Global middleware
  app.use(requestLogger);

  // 2. Register routes in proper order with enhanced error handling:
  try {
    // Health check routes (highest priority, no auth required)
    registerHealthRoutes(app);
    
    // API versioning prefix for all routes
    const apiRouter = express.Router();

    // Add API-specific middleware
    apiRouter.use(express.json());
    apiRouter.use((req, res, next) => {
      res.setHeader('X-API-Version', '1.0');
      next();
    });

    // Register all core routes on the API router
    registerCoreRoutes(apiRouter);

    // Mount API router with prefix and error handling
    app.use('/api', (err: Error, _req: Request, _res: Response, next: NextFunction) => {
      console.error('API route error:', err);
      next(err);
    });
    app.use('/api', apiRouter);
    
    // Error handling (must be registered last)
    registerErrorRoutes(app);
    
    console.log('Routes registered successfully');
  } catch (error) {
    console.error('Error registering routes:', error);
    if (error instanceof Error) {
      throw new Error(`Route registration failed: ${error.message}`);
    }
    throw error;
  }
}