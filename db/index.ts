import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, PoolClient } from "@neondatabase/serverless";
import { WebSocket } from "ws";
import * as schema from "./schema.js";
import { neonConfig } from '@neondatabase/serverless';
import { sql } from "drizzle-orm";

console.log("=== Database Initialization: Starting ===");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure WebSocket globally for Neon with Replit optimizations
console.log("Configuring Neon database connection...");
neonConfig.webSocketConstructor = WebSocket;
neonConfig.poolQueryViaFetch = true;
neonConfig.useSecureWebSocket = true;
neonConfig.pipeliningSupportValue = false; // Disable pipelining for better stability
neonConfig.fetchConnectionCache = true; // Enable connection caching

// Replit-optimized retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  connectionTimeoutMs: 10000,
  healthCheckIntervalMs: 30000,
  maxConnections: 5,
  idleTimeoutMs: 30000,
  acquireTimeoutMs: 60000
};

// Connection state tracking
type ConnectionState = {
  isInitializing: boolean;
  lastInitAttempt: number;
  connectionErrors: number;
  lastError?: Error;
};

const state: ConnectionState = {
  isInitializing: false,
  lastInitAttempt: 0,
  connectionErrors: 0
};

// Enhanced lazy loading with connection pooling
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
const INIT_COOLDOWN = 5000; // 5 seconds cooldown between initialization attempts

// Verify pool connection
async function verifyPoolConnection(client: PoolClient): Promise<boolean> {
  try {
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Pool connection verification failed:', error);
    return false;
  }
}

// Check database connection
export async function checkConnection(): Promise<boolean> {
  try {
    const poolInstance = await initializePool();
    const client = await poolInstance.connect();
    const isValid = await verifyPoolConnection(client);
    client.release();
    return isValid;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}

// Enhanced pool initialization with connection verification and cooldown
async function initializePool(): Promise<Pool> {
  const now = Date.now();

  if (state.isInitializing) {
    console.log("Pool initialization already in progress, waiting...");
    while (state.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (pool) return pool;
  }

  // Check existing pool
  if (pool) {
    try {
      const client = await pool.connect();
      const isValid = await verifyPoolConnection(client);
      client.release();
      if (isValid) {
        console.log("Existing pool verified successfully");
        return pool;
      }
    } catch (error) {
      console.warn("Existing pool verification failed:", error);
    }
    
    // Reset pool if verification failed
    try {
      await pool.end();
    } catch (error) {
      console.warn("Error ending existing pool:", error);
    }
    pool = null;
    db = null;
  }

  // Respect cooldown period
  const timeSinceLastAttempt = now - state.lastInitAttempt;
  if (timeSinceLastAttempt < INIT_COOLDOWN) {
    await new Promise(resolve => 
      setTimeout(resolve, INIT_COOLDOWN - timeSinceLastAttempt)
    );
  }

  state.isInitializing = true;
  state.lastInitAttempt = now;

  try {
    console.log("Initializing connection pool with Replit-optimized configuration");
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: RETRY_CONFIG.maxConnections,
      idleTimeoutMillis: RETRY_CONFIG.idleTimeoutMs,
      connectionTimeoutMillis: RETRY_CONFIG.connectionTimeoutMs,
      acquireTimeoutMillis: RETRY_CONFIG.acquireTimeoutMs,
      maxUses: 5000, // Reset connection after 5000 queries
      ssl: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
      }
    });

    // Verify new pool with retries
    let retries = RETRY_CONFIG.maxRetries;
    let delay = RETRY_CONFIG.initialDelayMs;

    while (retries > 0) {
      try {
        const client = await pool.connect();
        const isValid = await verifyPoolConnection(client);
        client.release();
        
        if (isValid) {
          console.log("Pool initialization successful");
          state.connectionErrors = 0;
          break;
        }
      } catch (error) {
        retries--;
        state.connectionErrors++;
        state.lastError = error instanceof Error ? error : new Error(String(error));
        
        if (retries === 0) throw state.lastError;
        
        console.warn(`Pool verification failed (${retries} retries left):`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
      }
    }

    // Setup pool event handlers
    pool.on('error', (err: Error) => {
      console.error('Pool error:', err);
      state.connectionErrors++;
      state.lastError = err;
      
      if (!state.isInitializing) {
        pool = null;
        db = null;
      }
    });

    pool.on('connect', (client: PoolClient) => {
      console.log('New database connection established');
      client.on('error', (err: Error) => {
        console.error('Client connection error:', err);
        state.connectionErrors++;
        state.lastError = err;
      });
    });

    return pool;
  } catch (error) {
    console.error('Pool initialization failed:', error);
    pool = null;
    throw error;
  } finally {
    state.isInitializing = false;
  }
}

// Get pool stats with connection state
export const getPoolStatus = async () => {
  if (!pool) return { 
    status: 'not_initialized',
    connectionState: {
      errors: state.connectionErrors,
      lastError: state.lastError?.message,
      lastInitAttempt: new Date(state.lastInitAttempt).toISOString()
    }
  };
  
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    status: 'active',
    connectionState: {
      errors: state.connectionErrors,
      lastError: state.lastError?.message,
      lastInitAttempt: new Date(state.lastInitAttempt).toISOString()
    }
  };
};

// Graceful cleanup with improved error handling
export const cleanup = async () => {
  stopHealthCheck();
  if (pool) {
    try {
      await pool.end();
      console.log("Database connections closed successfully");
    } catch (error) {
      if (error instanceof Error && error.message !== 'Called end on pool more than once') {
        console.error("Error closing database connections:", error);
        throw error;
      }
    } finally {
      pool = null;
      db = null;
    }
  }
};

// Enhanced connection validation function
async function validateConnection(db: ReturnType<typeof drizzle>): Promise<boolean> {
  try {
    await db.select({ value: sql`1` }).execute();
    return true;
  } catch (error) {
    console.error("Database connection validation failed:", error);
    return false;
  }
}

// Enhanced lazy-loaded database instance getter with improved validation
let connectionRetryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function getDrizzle() {
  if (db) {
    try {
      // Verify existing connection
      const isValid = await validateConnection(db);
      if (isValid) {
        return db;
      }
      console.warn("Existing connection invalid, reinitializing...");
      db = null;
    } catch (error) {
      console.warn("Connection verification failed:", error);
      db = null;
    }
  }

  while (connectionRetryCount < MAX_RETRIES) {
    try {
      const poolInstance = await initializePool();
      if (!poolInstance) {
        throw new Error("Failed to initialize database pool");
      }

      db = drizzle(poolInstance, { schema });
      const isValid = await validateConnection(db);
      
      if (isValid) {
        console.log("Database connection established successfully");
        connectionRetryCount = 0; // Reset counter on success
        return db;
      }
      
      throw new Error("Connection validation failed");
    } catch (error) {
      connectionRetryCount++;
      console.error(`Database connection attempt ${connectionRetryCount} failed:`, error);
      
      if (connectionRetryCount < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }
      
      throw new Error(`Failed to establish database connection after ${MAX_RETRIES} attempts`);
    }
  }

  throw new Error("Failed to initialize database connection");
}

// Export enhanced getDb function with retry mechanism
export const getDb = async () => {
  try {
    return await getDrizzle();
  } catch (error) {
    console.error("Error getting database instance:", error);
    throw error;
  }
};

// Health check implementation
let healthCheckInterval: NodeJS.Timeout | null = null;

export const startHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    try {
      if (pool) {
        const client = await pool.connect();
        const isValid = await verifyPoolConnection(client);
        client.release();
        
        if (!isValid) {
          console.warn("Health check failed, resetting pool...");
          pool = null;
          db = null;
        }
      }
    } catch (error) {
      console.error("Health check error:", error);
      pool = null;
      db = null;
    }
  }, RETRY_CONFIG.healthCheckIntervalMs);
};

export const stopHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

// Export pool for session store
export { pool };
