import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, PoolClient } from "@neondatabase/serverless";
import { WebSocket } from "ws";
import * as schema from "./schema.js";
import { neonConfig } from '@neondatabase/serverless';

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
  idleTimeoutMs: 30000
};

console.log("Initializing connection pool with Replit-optimized configuration:", {
  maxConnections: RETRY_CONFIG.maxConnections,
  idleTimeout: `${RETRY_CONFIG.idleTimeoutMs}ms`,
  connectionTimeout: `${RETRY_CONFIG.connectionTimeoutMs}ms`,
  maxUses: 5000
});

// Configure connection pool optimized for Replit environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: RETRY_CONFIG.maxConnections,
  idleTimeoutMillis: RETRY_CONFIG.idleTimeoutMs,
  connectionTimeoutMillis: RETRY_CONFIG.connectionTimeoutMs,
  maxUses: 5000,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined
  }
}) as any;

// Enhanced pool event listeners with Replit-specific logging
pool.on('error', async (err: Error) => {
  console.error('=== CRITICAL: Replit Pool Error ===');
  console.error('Error details:', err.message);
  console.error('Stack:', err.stack);
  await handlePoolError(err);
});

pool.on('connect', (client: PoolClient) => {
  console.log('=== New Database Connection Established on Replit ===');
  console.log(`Pool status: ${pool.totalCount} total, ${pool.idleCount} idle`);
  
  client.on('error', async (err: Error) => {
    console.error('=== Replit Client Connection Error ===');
    console.error('Error details:', err.message);
    await handleClientError(client, err);
  });
});

// Enhanced connection retry logic optimized for Replit
async function retryWithBackoff(operation: () => Promise<any>, retryCount = 0): Promise<any> {
  try {
    return await operation();
  } catch (error: any) {
    if (retryCount >= RETRY_CONFIG.maxRetries) {
      console.error(`Maximum retry attempts (${RETRY_CONFIG.maxRetries}) reached on Replit:`, error);
      throw error;
    }

    const baseDelay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(2, retryCount),
      RETRY_CONFIG.maxDelayMs
    );
    const jitter = Math.random() * 200;
    const delay = baseDelay + jitter;

    console.log(`Replit retry attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(operation, retryCount + 1);
  }
}

// Replit-optimized pool error handler
async function handlePoolError(error: Error) {
  console.error('Pool error detected on Replit, attempting recovery...', error);
  try {
    await retryWithBackoff(async () => {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Pool recovery successful on Replit');
    });
  } catch (err) {
    console.error('Pool recovery failed on Replit:', err);
    await terminatePool();
  }
}

// Replit-optimized client error handler
async function handleClientError(client: PoolClient, error: Error) {
  console.error('Client error detected on Replit, attempting recovery...', error);
  try {
    client.release(error);
    await retryWithBackoff(async () => {
      const newClient = await pool.connect();
      await newClient.query('SELECT 1');
      newClient.release();
      console.log('Client recovery successful on Replit');
    });
  } catch (err) {
    console.error('Client recovery failed on Replit:', err);
  }
}

// Enhanced connection health check optimized for Replit
export const checkConnection = async () => {
  return retryWithBackoff(async () => {
    const client = await pool.connect();
    try {
      const startTime = Date.now();
      await client.query('SELECT 1');
      const duration = Date.now() - startTime;
      console.log(`Replit database connection successful (query time: ${duration}ms)`);
      return true;
    } finally {
      client.release();
    }
  });
};

// Periodic health check monitor optimized for Replit
let healthCheckInterval: NodeJS.Timeout | null = null;

export const startHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    try {
      await checkConnection();
    } catch (error) {
      console.error('Replit health check failed:', error);
    }
  }, RETRY_CONFIG.healthCheckIntervalMs);
};

export const stopHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

// Enhanced pool monitoring with Replit metrics
export const getPoolStatus = async () => {
  try {
    const result = await pool.query(`
      SELECT current_setting('max_connections') as max_connections,
             (SELECT count(*) FROM pg_stat_activity) as current_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections
    `);
    
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        utilizationRate: pool.totalCount ? (pool.totalCount - pool.idleCount) / pool.totalCount : 0
      },
      systemStats: {
        ...result.rows[0],
        timestamp: new Date().toISOString(),
        environment: 'replit'
      }
    };
  } catch (error) {
    console.error('Failed to get Replit pool status:', error);
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        utilizationRate: pool.totalCount ? (pool.totalCount - pool.idleCount) / pool.totalCount : 0
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Graceful pool termination optimized for Replit
async function terminatePool() {
  console.error('Terminating Replit connection pool due to unrecoverable error');
  stopHealthCheck();
  try {
    await pool.end();
  } catch (error) {
    console.error('Error while terminating Replit pool:', error);
  }
}

// Create database client with connection pooling
console.log("Initializing Drizzle ORM for Replit...");
export const db = drizzle(pool, { schema });

// Start health check monitor
startHealthCheck();

export { pool };
